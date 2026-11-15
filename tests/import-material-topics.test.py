"""保护分类表显式书目绑定、版本范围和重跑时的原主题证据。"""
import copy
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('import_material_topics', ROOT / 'scripts/import-material-topics.py')
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class MaterialTopicImportTest(unittest.TestCase):
    def fixture(self, book_id='version-a'):
        row = {'title': 'My Book', 'patterns': ['I see …'], 'topics': ['animals'], 'locator': '图1 第1行'}
        if book_id is not None:
            row['bookId'] = book_id
        return {
            'topic-taxonomy': {'nodes': [{'id': 'animals'}, {'id': 'patterns'}], 'sources': [],
                               'bookOverrides': {'version-a': {'topics': ['animals'], 'evidence': [
                                   {'kind': 'source-classification', 'sourceId': 'shared-source',
                                    'locator': '原主题图', 'summary': '原分类不可因新句型表被删除'}]}}},
            'resource-books': {'sources': [], 'books': [
                {'id': 'version-a', 'resourceId': 'series', 'title': 'My Book', 'level': 'A', 'edition': 'Edition A', 'topicStatus': 'classification-verified'},
                {'id': 'version-b', 'resourceId': 'series', 'title': 'My Book', 'level': 'A', 'edition': 'Edition B', 'topicStatus': 'pending'}]},
            'reading-plans': {'plans': []},
            'material-book-topics': {'books': {}},
            'material-resource-topics': {'resources': {}},
            'material-topic-research': {'checkedAt': '2026-11-15', 'sources': [{'id': 'shared-source'}], 'tables': [
                {'sourceId': 'shared-source', 'resourceId': 'series', 'levels': ['A'],
                 'sourceLevel': '整理表原Level A', 'status': 'classification-verified', 'rows': [row]}]}}

    def run_import(self, values):
        writes = {}
        with patch.object(IMPORTER, 'read', side_effect=lambda name: copy.deepcopy(values[name])), \
             patch.object(IMPORTER, 'write', side_effect=lambda path, value: writes.__setitem__(path.name, copy.deepcopy(value))), \
             patch('builtins.print'):
            IMPORTER.main()
        return writes

    def test_explicit_id_isolates_duplicate_titles_and_preserves_prior_evidence_on_repeat(self):
        values = self.fixture()
        writes = self.run_import(values)
        taxonomy = writes['topic-taxonomy.json']
        self.assertIn('version-a', taxonomy['bookOverrides'])
        self.assertNotIn('version-b', taxonomy['bookOverrides'])
        self.assertEqual(taxonomy['checkedAt'], '2026-11-15')
        report = writes['material-topic-patterns-20261115.json']
        self.assertEqual(report['checkedAt'], '2026-11-15')
        self.assertEqual(report['matched'][0]['bookId'], 'version-a')
        self.assertEqual(report['matched'][0]['sourceLevel'], '整理表原Level A')
        before = copy.deepcopy(values['resource-books']['books'])
        self.assertEqual(writes['resource-books.json']['books'], before)
        values['topic-taxonomy'] = taxonomy
        values['resource-books'] = writes['resource-books.json']
        again = self.run_import(values)['topic-taxonomy.json']
        def normalized(value):
            result = copy.deepcopy(value)
            for mapping in result['bookOverrides'].values():
                mapping['evidence'] = sorted(mapping.get('evidence', []), key=lambda item: json.dumps(item, sort_keys=True))
            return result
        self.assertEqual(normalized(again), normalized(taxonomy))
        evidence = again['bookOverrides']['version-a']['evidence']
        self.assertEqual(sum(item['kind'] == 'source-classification' for item in evidence), 1)
        self.assertEqual(sum(item['kind'] == 'sentence-pattern-table' for item in evidence), 1)
        self.assertEqual(sum(item['kind'] == 'content-summary' for item in evidence), 1)

    def test_explicit_id_cannot_bypass_resource_level_edition_or_title(self):
        for field, bad_value in [('resourceId', 'other-series'), ('levels', ['B']), ('editionContains', 'Edition B')]:
            with self.subTest(field=field):
                values = self.fixture()
                values['material-topic-research']['tables'][0][field] = bad_value
                with self.assertRaisesRegex(ValueError, '冲突'):
                    self.run_import(values)
        values = self.fixture()
        values['material-topic-research']['tables'][0]['rows'][0]['title'] = 'Another Book'
        with self.assertRaisesRegex(ValueError, '冲突'):
            self.run_import(values)
        with self.assertRaisesRegex(ValueError, '未知分类表书目ID'):
            self.run_import(self.fixture('unknown-id'))

    def test_prior_date_keeps_original_report_filename(self):
        values = self.fixture()
        values['material-topic-research']['checkedAt'] = '2026-11-14'
        writes = self.run_import(values)
        self.assertIn('material-topic-patterns-20261114.json', writes)
        self.assertNotIn('material-topic-patterns-20261115.json', writes)

    def test_row_source_level_preserves_original_grade_when_catalog_combines_levels(self):
        values = self.fixture()
        values['material-topic-research']['tables'][0]['rows'][0]['sourceLevel'] = '原图 E'
        writes = self.run_import(values)
        self.assertEqual(writes['material-topic-patterns-20261115.json']['matched'][0]['sourceLevel'], '原图 E')
        evidence = writes['topic-taxonomy.json']['bookOverrides']['version-a']['evidence']
        self.assertEqual(next(item for item in evidence if item['kind'] == 'sentence-pattern-table')['sourceLevel'], '原图 E')

    def test_verified_research_is_not_downgraded_by_title_fallback_on_repeat(self):
        values = self.fixture()
        book = values['resource-books']['books'][0]
        book.update(topicStatus='pending', topicBasis='待核', externalIds={'xiaohuasheng': ['stable-guid']}, futureField={'keep': True})
        values['material-book-topics']['books']['version-a'] = {
            'topics': ['animals'], 'status': 'title-fallback', 'basis': '仅按标题兜底',
            'sourceIds': ['title-source'], 'evidence': [{'kind': 'title-fallback', 'sourceId': 'title-source', 'summary': '题名', 'locator': '公共题名'}]}
        first = self.run_import(values)
        values['topic-taxonomy'] = first['topic-taxonomy.json']
        values['resource-books'] = first['resource-books.json']
        second = self.run_import(values)
        for output in (first, second):
            mapping = output['topic-taxonomy.json']['bookOverrides']['version-a']
            self.assertEqual(mapping['status'], 'classification-verified')
            self.assertEqual(output['resource-books.json']['books'][0]['topicStatus'], 'classification-verified')
            self.assertTrue(any(item['kind'] == 'source-classification' for item in mapping['evidence']))
            self.assertTrue(any(item['kind'] == 'content-summary' for item in mapping['evidence']))
            self.assertEqual(output['resource-books.json']['books'][0]['externalIds'], {'xiaohuasheng': ['stable-guid']})
            self.assertEqual(output['resource-books.json']['books'][0]['futureField'], {'keep': True})
        self.assertEqual(first, second)

    def test_without_explicit_id_ambiguous_versions_remain_unmatched(self):
        writes = self.run_import(self.fixture(None))
        report = writes['material-topic-patterns-20261115.json']
        self.assertEqual(report['matched'], [])
        self.assertEqual(report['unmatched'][0]['candidateIds'], ['version-a', 'version-b'])
        self.assertFalse(writes['topic-taxonomy.json']['bookOverrides']['version-a'].get('patterns'))

    def test_title_topic_and_independent_research_pattern_keep_first_pass_order(self):
        values = self.fixture()
        values['resource-books']['books'][0]['topicStatus'] = 'title-fallback'
        values['topic-taxonomy']['bookOverrides']['version-a']['status'] = 'title-fallback'
        values['material-book-topics']['books']['version-a'] = {
            'topics': ['animals'], 'status': 'title-fallback', 'basis': '标题',
            'sourceIds': ['catalog-title-topic-fallback-20261114']}
        values['material-topic-research']['tables'][0]['rows'][0].pop('topics')
        first = self.run_import(values)
        values['topic-taxonomy'] = first['topic-taxonomy.json']
        values['resource-books'] = first['resource-books.json']
        self.assertEqual(first, self.run_import(values))

    def test_content_upgrade_does_not_promote_unrelated_title_topic_to_verified(self):
        values = self.fixture()
        values['topic-taxonomy']['nodes'].append({'id': 'social'})
        values['resource-books']['books'][0]['topicStatus'] = 'pending'
        values['material-book-topics']['books']['version-a'] = {
            'topics': ['animals'], 'status': 'title-fallback', 'basis': '标题',
            'sourceIds': ['catalog-title-topic-fallback-20261114']}
        values['material-topic-research']['tables'][0]['rows'][0]['topics'] = ['social']
        first = self.run_import(values)
        mapping = first['topic-taxonomy.json']['bookOverrides']['version-a']
        self.assertIn('social', mapping['topics'])
        self.assertNotIn('animals', mapping['topics'])
        self.assertNotIn('catalog-title-topic-fallback-20261114', mapping['sourceIds'])
        values['topic-taxonomy'] = first['topic-taxonomy.json']
        values['resource-books'] = first['resource-books.json']
        self.assertEqual(first, self.run_import(values))

    def test_description_only_row_keeps_exact_source_url_without_claiming_sentence_evidence(self):
        values = self.fixture()
        values['resource-books']['books'][0]['topicStatus'] = 'pending'
        source = values['material-topic-research']['sources'][0]
        source['url'] = 'https://www.xiaohongshu.com/explore/695a4646000000001e010ed0'
        table = values['material-topic-research']['tables'][0]
        table['status'] = 'description-derived'
        table['rows'][0]['patterns'] = []
        first = self.run_import(values)
        mapping = first['topic-taxonomy.json']['bookOverrides']['version-a']
        self.assertEqual(mapping['status'], 'description-derived')
        self.assertNotIn('patternStatus', mapping)
        self.assertEqual(mapping['patterns'], [])
        self.assertFalse(any(item['kind'] == 'sentence-pattern-table' for item in mapping['evidence']))
        description = next(item for item in mapping['evidence'] if item['kind'] == 'content-description')
        self.assertEqual(description['url'], source['url'])
        self.assertEqual(description['sourceId'], source['id'])
        values['topic-taxonomy'] = first['topic-taxonomy.json']
        values['resource-books'] = first['resource-books.json']
        self.assertEqual(first, self.run_import(values))

    def test_withdrawn_generated_title_mapping_does_not_survive_in_output(self):
        values = self.fixture()
        values['material-topic-research']['tables'] = []
        values['resource-books']['books'][0].update(topicStatus='title-fallback', futureField={'keep': True})
        values['topic-taxonomy']['bookOverrides']['version-a'] = {
            'topics': ['animals'], 'status': 'title-fallback', 'futureField': {'keep': True},
            'sourceIds': ['catalog-title-topic-fallback-20261114'],
            'evidence': [{'kind': 'title-fallback', 'sourceId': 'catalog-title-topic-fallback-20261114'}]}
        first = self.run_import(values)
        mapping = first['topic-taxonomy.json']['bookOverrides']['version-a']
        self.assertEqual(mapping['topics'], [])
        self.assertEqual(mapping['status'], 'pending')
        self.assertEqual(mapping['futureField'], {'keep': True})
        self.assertEqual(first['resource-books.json']['books'][0]['futureField'], {'keep': True})
        values['topic-taxonomy'] = first['topic-taxonomy.json']
        values['resource-books'] = first['resource-books.json']
        self.assertEqual(first, self.run_import(values))


if __name__ == '__main__':
    unittest.main()
