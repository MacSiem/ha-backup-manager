"""Regression checks for standalone-card isolation and escaping."""

from __future__ import annotations

import unittest
from pathlib import Path


CARD_PATH = Path(__file__).resolve().parents[1] / "ha-backup-manager.js"
RESIDUALS = (
    "SPLIT_TAGS",
    "deepFindAll",
    "injectAll",
    "__haToolsSplitDonateInjector",
    "window._haToolsEsc",
    "window.HAToolsBentoCSS",
)


class CardIsolationTests(unittest.TestCase):
    def test_card_does_not_mutate_other_custom_cards(self) -> None:
        source = CARD_PATH.read_text(encoding="utf-8")

        self.assertIn("const _esc = (s) => _escBase(_asText(s));", source)
        self.assertIn('data-source="own-card"', source)
        self.assertIn("buymeacoffee.com/macsiem", source)
        self.assertIn("this.shadowRoot.innerHTML = html + ownDonateFooter();", source)
        self.assertIn("const HA_BACKUP_MANAGER_BENTO_CSS = `", source)
        self.assertIn("<style>${HA_BACKUP_MANAGER_BENTO_CSS}", source)
        for marker in RESIDUALS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, source)

    def test_preseeded_global_css_cannot_override_local_css(self) -> None:
        source = CARD_PATH.read_text(encoding="utf-8")

        self.assertNotIn("window.HAToolsBentoCSS", source)
        self.assertIn("${HA_BACKUP_MANAGER_BENTO_CSS}", source)


if __name__ == "__main__":
    unittest.main()
