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
        cls.entry = (cls.output / 'index.html').read_text()
        cls.runtime = set(re.findall(r'(?:src|href)="\./(runtime/[^\"]+)"', cls.entry))
        cls.html = cls.entry + '\n' + '\n'.join((cls.output / name).read_text() for name in sorted(cls.runtime))
        match = re.search(r'window\.ROADMAP_RAW=(.*?);\n', cls.html)
        cls.data = json.loads(match.group(1))
        cls.books_url = json.loads(re.search(r'window\.ROADMAP_BOOKS_URL=(.*?);', cls.entry).group(1))
        cls.directory = json.loads((cls.output / cls.books_url).read_text())
        cls.chunks = json.loads(re.search(r'window\.ROADMAP_CHUNKS=(.*?);', cls.html).group(1))
        cls.lazy = {cls.books_url, cls.chunks['helloReading'], *cls.directory['detailFiles']}

    def test_fixed_birthday_uses_shared_service_without_browser_records(self):
        self.assertNotIn('2020-11-24', self.html)
        self.assertNotIn('/Users/', self.html)
        self.assertNotIn('23个月3天', self.html)
        self.assertIn("birthDate:'',vocabulary:0", self.html)
        self.assertIn("const BIRTH_DATE = '2024-11-24'", self.html)
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
        collect(self.directory)
        for name in self.lazy: collect(json.loads((self.output / name).read_text()))
        self.assertGreater(len(paths), 30)
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual((self.output / path).read_bytes(), (ROOT / 'english' / path).read_bytes())
        actual = {path.relative_to(self.output).as_posix() for path in self.output.rglob('*') if path.is_file()}
        self.assertEqual(actual, paths | self.runtime | self.lazy | {'index.html', '.nojekyll'})
        self.assertEqual(self.data['resourceBooks']['books'], [])
        self.assertGreater(len(self.directory['books']), 3000)

    def test_all_three_routes_and_xu_supplements_are_preserved(self):
        for route in ['banana', 'xu', 'qing']:
            self.assertIn(route, self.data)
        self.assertEqual(len(self.data['xuSupplements']), 2)

    def test_lazy_data_restores_all_original_book_and_topic_evidence(self):
        import runpy
        build = runpy.run_path(str(ROOT / 'english/build.py'))
        raw = build['public_data'](build['RAW'])
        restored = {book['id']: {key:value for key,value in book.items() if key != 'detailChunk'} for book in self.directory['books']}
        topics = dict(self.data['topicTaxonomy']['bookOverrides'])
        for name in self.directory['detailFiles']:
            detail = json.loads((self.output / name).read_text())
            for book in detail['books']: restored[book['id']].update(book)
            topics.update(detail['topics'])
        self.assertEqual(list(restored.values()), raw['resourceBooks']['books'])
        self.assertEqual(topics, raw['topicTaxonomy']['bookOverrides'])
        self.assertEqual(json.loads((self.output / self.chunks['helloReading']).read_text()), raw['helloReading'])
        self.assertLess((self.output / self.books_url).stat().st_size, len(build['inline_json'](raw['resourceBooks']).encode()) * .45)
        self.assertNotIn('materialCards', self.data['helloReading'])

    def test_entry_keeps_small_and_runtime_files_match_their_content(self):
        import hashlib
        self.assertLess(len(self.entry.encode()), 6000)
        self.assertEqual(len(self.runtime), 3)
        for name in self.runtime:
            self.assertIn(hashlib.sha256((self.output / name).read_bytes()).hexdigest()[:16], name)

    def test_initial_index_preserves_reading_ranges_counts_and_topic_filters(self):
        # 不先恢复证据：首开轻目录必须直接得出与完整目录相同的书单及进度。
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const M=require('./english/model.js'),B=require('./english/book-progress.js'),L=require('./english/library-books.js');
const {raw,index}=JSON.parse(fs.readFileSync(0,'utf8'));
const full=JSON.parse(fs.readFileSync('english/data/resource-books.json','utf8'));
const volumes=raw.resourceVolumes,catalog=M.normalize(raw),records={};
full.books.filter((_,i)=>i%29===0).forEach(book=>records[B.MANUAL+book.id]={status:'done'});
for(const resource of catalog.resources){
  const select=data=>B.catalogPlans(data,volumes,resource.id).map(plan=>({id:plan.id,groups:plan.groups,ids:B.books(plan).map(book=>book.id),progress:B.progress(records,plan)}));
  assert.deepEqual(select(index),select(full),resource.title+'阅读范围与进度');
  const count=data=>{const value=L.seriesCount(data,resource,M,volumes);return {total:value.total,ids:value.books.map(book=>book.id),parts:value.parts};};
  assert.deepEqual(count(index),count(full),resource.title+'图鉴数量');
}
const topicsSource=fs.readFileSync('english/topics.js','utf8');
function topics(taxonomy){const context={ROADMAP_RAW:{topicTaxonomy:taxonomy}};vm.runInNewContext(topicsSource,context);return context.EnglishTopics;}
const firstTopics=topics(raw.topicTaxonomy),fullTopics=topics(JSON.parse(fs.readFileSync('english/data/topic-taxonomy.json','utf8')));
index.books.forEach((book,i)=>assert.equal(JSON.stringify(firstTopics.entryTopics('book',book)),JSON.stringify(fullTopics.entryTopics('book',full.books[i])),book.id+'主题筛选'));
'''
        result = subprocess.run(['node', '-e', script], cwd=ROOT, input=json.dumps({'raw': self.data, 'index': self.directory}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

if __name__ == '__main__':
    unittest.main()
