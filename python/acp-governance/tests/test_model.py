"""Proxy-plane tests. Stdlib unittest — this package has no test dependencies.

Run: python3 -m unittest discover -s tests -v   (from python/acp-governance)
"""
from __future__ import annotations

import os
import sys
import unittest
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import acp_governance as acp  # noqa: E402
from acp_governance._config import configure  # noqa: E402

GATEWAY = "https://api.agenticcontrolplane.com"
TOUCHED = ("ACP_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_KEY")


class ModelPlaneTest(unittest.TestCase):
    def setUp(self) -> None:
        self._saved = {k: os.environ.get(k) for k in TOUCHED}
        for k in TOUCHED:
            os.environ.pop(k, None)
        configure(base_url=GATEWAY)

    def tearDown(self) -> None:
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        configure(base_url=GATEWAY)

    # --- URL derivation -------------------------------------------------

    def test_each_shape_has_its_own_mount(self) -> None:
        self.assertEqual(acp.model_base_url("anthropic"), f"{GATEWAY}/anthropic")
        self.assertEqual(acp.model_base_url("openai"), f"{GATEWAY}/v1")
        self.assertEqual(acp.model_base_url("openai-responses"), f"{GATEWAY}/openai/v1")

    def test_openai_shapes_are_not_interchangeable(self) -> None:
        # /v1 serves chat completions, /openai/v1 serves responses. Conflating
        # them is a silent 404, so the two must never resolve to the same base.
        self.assertNotEqual(acp.model_base_url("openai"), acp.model_base_url("openai-responses"))

    def test_derives_from_configured_gateway(self) -> None:
        configure(base_url="https://acp.internal.example")
        self.assertEqual(acp.model_base_url("anthropic"), "https://acp.internal.example/anthropic")

    def test_trailing_slash_does_not_double_up(self) -> None:
        configure(base_url=GATEWAY + "/")
        self.assertEqual(acp.model_base_url("openai"), f"{GATEWAY}/v1")

    def test_unknown_shape_is_rejected(self) -> None:
        with self.assertRaises(acp.ModelConfigError):
            acp.model_base_url("bedrock")

    # --- key handling ---------------------------------------------------

    def test_missing_key_raises_with_actionable_message(self) -> None:
        with self.assertRaises(acp.ModelConfigError) as ctx:
            acp.api_key()
        self.assertIn("ACP_API_KEY", str(ctx.exception))

    def test_client_kwargs_are_sdk_constructor_shaped(self) -> None:
        os.environ["ACP_API_KEY"] = "gsk_test"
        self.assertEqual(
            acp.model_client_kwargs("anthropic"),
            {"base_url": f"{GATEWAY}/anthropic", "api_key": "gsk_test"},
        )

    # --- init() ---------------------------------------------------------

    def test_init_sets_both_providers(self) -> None:
        os.environ["ACP_API_KEY"] = "gsk_test"
        result = acp.init()
        self.assertEqual(os.environ["ANTHROPIC_BASE_URL"], f"{GATEWAY}/anthropic")
        self.assertEqual(os.environ["ANTHROPIC_API_KEY"], "gsk_test")
        self.assertEqual(os.environ["OPENAI_BASE_URL"], f"{GATEWAY}/v1")
        self.assertEqual(os.environ["OPENAI_API_KEY"], "gsk_test")
        self.assertEqual(result["anthropic"], f"{GATEWAY}/anthropic")

    def test_init_respects_an_existing_operator_choice(self) -> None:
        os.environ["ACP_API_KEY"] = "gsk_test"
        os.environ["ANTHROPIC_BASE_URL"] = "https://my-gateway.example"
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-real"
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = acp.init(shapes=("anthropic",))
        # All-or-nothing: an untouched base URL must keep its original key.
        self.assertEqual(os.environ["ANTHROPIC_BASE_URL"], "https://my-gateway.example")
        self.assertEqual(os.environ["ANTHROPIC_API_KEY"], "sk-ant-real")
        self.assertIn("skipped", result["anthropic"])
        self.assertTrue(any(issubclass(w.category, RuntimeWarning) for w in caught))

    def test_init_is_idempotent(self) -> None:
        os.environ["ACP_API_KEY"] = "gsk_test"
        first = acp.init()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            second = acp.init()
        self.assertEqual(first, second)
        self.assertEqual(second["anthropic"], f"{GATEWAY}/anthropic")
        self.assertFalse(caught, "re-running init() on ACP's own URL must not warn")

    def test_init_can_select_the_responses_shape(self) -> None:
        os.environ["ACP_API_KEY"] = "gsk_test"
        acp.init(shapes=("openai-responses",))
        self.assertEqual(os.environ["OPENAI_BASE_URL"], f"{GATEWAY}/openai/v1")

    def test_proxy_false_leaves_environment_untouched(self) -> None:
        os.environ["ACP_API_KEY"] = "gsk_test"
        self.assertEqual(acp.init(proxy=False), {})
        self.assertNotIn("ANTHROPIC_BASE_URL", os.environ)

    def test_init_without_key_fails_before_mutating_anything(self) -> None:
        with self.assertRaises(acp.ModelConfigError):
            acp.init()
        self.assertNotIn("ANTHROPIC_BASE_URL", os.environ)


if __name__ == "__main__":
    unittest.main()
