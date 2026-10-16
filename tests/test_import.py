import sys
import unittest
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_excel import parse_date

class ExcelDates(unittest.TestCase):
    def test_all_source_date_encodings(self):
        for value in [datetime(2026,7,1), '2026.7.1', 20260701.0, 46204.0, '20260701']:
            with self.subTest(value=value):
                self.assertEqual(parse_date(value),'2026-07-01')

    def test_invalid_date_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            parse_date('2026.2.30')

if __name__ == '__main__':
    unittest.main()
