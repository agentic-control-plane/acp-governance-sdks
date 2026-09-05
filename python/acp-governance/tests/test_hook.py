"""Fail-open must be loud (#6). Stdlib unittest — no test dependencies.

Run: python3 -m unittest discover -s tests -v   (from python/acp-governance)

Before this, `pre_tool_use()` returned (True, "fail-open") for a missing
context AND for a dead gateway, warned nowhere, logged nothing, and wrote no
record. Misconfiguration was indistinguishable from success. These tests pin
the three things that changed: the reason names the cause, the process is
told once per cause, and every ungoverned call leaves a lapse line.
"""
from __future__ import annotations

import logging
import os
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import requests  # noqa: E402

from acp_governance import UngovernedWarning, clear_context, set_context  # noqa: E402
from acp_governance import _hook  # noqa: E402
from acp_governance._config import configure  # noqa: E402


class _Resp:
    def __init__(self, status: int, body=None, ok: bool | None = None):
        self.status_code = status
        self.ok = (200 <= status < 300) if ok is None else ok
        self._body = body

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


class LoudFailOpenTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._lapse = Path(self._tmp.name) / "lapse.log"
        self._saved_env = os.environ.get("ACP_LAPSE_LOG")
        os.environ["ACP_LAPSE_LOG"] = str(self._lapse)
        self._saved_post = requests.post
        configure(base_url="https://gateway.test")
        clear_context()
        _hook._reset_warnings_for_tests()

    def tearDown(self) -> None:
        requests.post = self._saved_post
        if self._saved_env is None:
            os.environ.pop("ACP_LAPSE_LOG", None)
        else:
            os.environ["ACP_LAPSE_LOG"] = self._saved_env
        clear_context()
        _hook._reset_warnings_for_tests()
        self._tmp.cleanup()

    def _lapse_lines(self) -> list[str]:
        if not self._lapse.exists():
            return []
        return [ln for ln in self._lapse.read_text().splitlines() if ln.strip()]

    # --- not configured -------------------------------------------------

    def test_no_context_allows_but_names_the_cause_and_warns_once(self) -> None:
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            allowed, reason = _hook.pre_tool_use("web_search", {"q": "x"})
            allowed2, reason2 = _hook.pre_tool_use("web_search", {"q": "y"})
        self.assertTrue(allowed)
        self.assertTrue(reason.startswith("fail-open (not-configured)"), reason)
        self.assertIn("set_context", str(w[0].message))
        ungoverned = [x for x in w if issubclass(x.category, UngovernedWarning)]
        # Once per cause per process — the second call is silent…
        self.assertEqual(len(ungoverned), 1)
        self.assertTrue(allowed2 and reason2.startswith("fail-open (not-configured)"))
        # …but every ungoverned call is on the ledger.
        lines = self._lapse_lines()
        self.assertEqual(len(lines), 2)
        self.assertIn("UNGOVERNED acp-governance-py not-configured tool=web_search", lines[0])

    def test_no_context_is_also_logged(self) -> None:
        with self.assertLogs("acp_governance", level=logging.WARNING) as cm:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                _hook.pre_tool_use("web_search", {})
        self.assertTrue(any("UNGOVERNED" in line and "not-configured" in line for line in cm.output))

    # --- unreachable ----------------------------------------------------

    def test_network_error_is_a_different_cause_with_its_own_warning(self) -> None:
        set_context(user_token="tok")

        def boom(*a, **k):
            raise requests.ConnectionError("refused")

        requests.post = boom
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            allowed, reason = _hook.pre_tool_use("web_search", {})
        self.assertTrue(allowed)
        self.assertTrue(reason.startswith("fail-open (unreachable): ConnectionError"), reason)
        self.assertEqual(len([x for x in w if issubclass(x.category, UngovernedWarning)]), 1)
        self.assertIn("unreachable tool=web_search ConnectionError", self._lapse_lines()[0])

    def test_each_cause_warns_independently(self) -> None:
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            _hook.pre_tool_use("t", {})  # not-configured
            set_context(user_token="tok")
            requests.post = lambda *a, **k: (_ for _ in ()).throw(requests.Timeout("slow"))
            _hook.pre_tool_use("t", {})  # unreachable
            requests.post = lambda *a, **k: _Resp(500)
            _hook.pre_tool_use("t", {})  # gateway-error
            _hook.pre_tool_use("t", {})  # gateway-error again → silent
        causes = [str(x.message).split("(")[1].split(":")[0] for x in w if issubclass(x.category, UngovernedWarning)]
        self.assertEqual(causes, ["not-configured", "unreachable", "gateway-error"])
        self.assertEqual(len(self._lapse_lines()), 4)

    # --- gateway answers ------------------------------------------------

    def test_a_4xx_carrying_a_verdict_is_the_verdict_not_an_outage(self) -> None:
        set_context(user_token="tok")
        requests.post = lambda *a, **k: _Resp(429, {"decision": "deny", "reason": "rate-limited: retry in 2s"})
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            allowed, reason = _hook.pre_tool_use("web_search", {})
        self.assertFalse(allowed)
        self.assertEqual(reason, "rate-limited: retry in 2s")
        self.assertEqual(w, [])
        self.assertEqual(self._lapse_lines(), [])

    def test_a_bodyless_5xx_is_fail_open_with_the_status(self) -> None:
        set_context(user_token="tok")
        requests.post = lambda *a, **k: _Resp(503)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            allowed, reason = _hook.pre_tool_use("web_search", {})
        self.assertTrue(allowed)
        self.assertEqual(reason, "fail-open (gateway-error): HTTP 503 from https://gateway.test/govern/tool-use")

    def test_a_real_allow_is_unchanged_and_silent(self) -> None:
        set_context(user_token="tok")
        requests.post = lambda *a, **k: _Resp(200, {"decision": "allow", "reason": ""})
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            self.assertEqual(_hook.pre_tool_use("web_search", {}), (True, ""))
        self.assertEqual(w, [])
        self.assertEqual(self._lapse_lines(), [])

    def test_lapse_log_can_be_disabled(self) -> None:
        os.environ["ACP_LAPSE_LOG"] = "off"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            _hook.pre_tool_use("t", {})
        self.assertEqual(self._lapse_lines(), [])


if __name__ == "__main__":
    unittest.main()
