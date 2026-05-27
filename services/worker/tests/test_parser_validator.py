import unittest

from app.pipeline.parser import parse_fields
from app.pipeline.validator import validate_fields


class ParserValidatorTests(unittest.TestCase):
    def test_extracts_receipt_totals_without_defaulting_currency(self):
        text = """Balance Mart
Date: 16/05/2026
Subtotal 10.00
SST 0.60
Service Charge 1.00
Discount 0.50
Rounding 0.00
Total 11.10
"""

        fields = parse_fields(text, 88.0)
        values = {field.name: field.value for field in fields}

        self.assertEqual(values["merchantName"], "Balance Mart")
        self.assertEqual(values["documentDate"], "2026-05-16")
        self.assertEqual(values["subtotal"], "10.00")
        self.assertEqual(values["tax"], "0.60")
        self.assertEqual(values["serviceCharge"], "1.00")
        self.assertEqual(values["discount"], "0.50")
        self.assertEqual(values["total"], "11.10")
        self.assertNotIn("currency", values)

        warnings = validate_fields(fields, 88.0, [])
        self.assertIn("currency_missing", warnings)
        self.assertNotIn("amount_arithmetic_mismatch", warnings)

    def test_flags_arithmetic_mismatch_and_low_confidence(self):
        text = """Cafe Example
2026-05-16
Subtotal 10.00
Tax 1.00
Total 99.00
"""

        fields = parse_fields(text, 42.0)
        warnings = validate_fields(fields, 42.0, [])

        self.assertIn("amount_arithmetic_mismatch", warnings)
        self.assertIn("low_ocr_confidence", warnings)


if __name__ == "__main__":
    unittest.main()
