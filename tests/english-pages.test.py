"""核对实际英语发布包的个人资料边界和原图引用完整性。"""
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parent.parent


class EnglishPagesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, 'english/build.py', '--pages'], cwd=ROOT, check=True, capture_output=True)
        cls.output = ROOT / 'dist' / 'english-pages'
        cls.html = (cls.output / 'index.html').read_text()
        match = re.search(r'window\.ROADMAP_RAW=(.*?);window\.ROADMAP_ASSETS=', cls.html)
        cls.data = json.loads(match.group(1))

    def test_public_page_has_blank_profile_and_no_personal_context(self):
        self.assertNotIn('2020-11-24', self.html)
        self.assertNotIn('/Users/', self.html)
        self.assertNotIn('23个月3天', self.html)
        self.assertIn("birthDate:'',vocabulary:0", self.html)
        self.assertNotIn('recommendation', self.data['editorial'])

    def test_every_referenced_source_and_preview_is_in_the_package(self):
        paths = set()
        def collect(value):
            if isinstance(value, dict):
                for item in value.values(): collect(item)
            elif isinstance(value, list):
                for item in value: collect(item)
            elif isinstance(value, str) and value.startswith('assets/'):
                paths.add(value)
        collect(self.data)
        self.assertGreater(len(paths), 30)
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual((self.output / path).read_bytes(), (ROOT / 'english' / path).read_bytes())
        actual = {path.relative_to(self.output).as_posix() for path in self.output.rglob('*') if path.is_file()}
        self.assertEqual(actual, paths | {'index.html', '.nojekyll'})

    def test_all_three_routes_and_xu_supplements_are_preserved(self):
        for route in ['banana', 'xu', 'qing']:
            self.assertIn(route, self.data)
        self.assertEqual(len(self.data['xuSupplements']), 2)


if __name__ == '__main__':
    unittest.main()
