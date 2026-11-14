"""保护离线主题归类的证据优先级和目录身份，不验证展示样式。"""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('classify_material_topics', ROOT / 'scripts/classify-material-topics.py')
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)


class MaterialTopicClassificationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = C.load(ROOT / 'english/data/material-topic-rules.json')
        cls.taxonomy = C.load(ROOT / 'english/data/topic-taxonomy.json')
        cls.rules = C.compile_rules(cls.config, {n['id'] for n in cls.taxonomy['nodes'] + cls.config.get('nodes', [])})

    def book(self, title, **extra):
        return {'id': 'test-stable-book', 'title': title, 'resourceId': 'test-resource', 'topics': [], 'topicStatus': 'pending', **extra}

    def classify(self, book, descriptions=(), taxonomy=None):
        index, repeated = C.description_index(descriptions)
        return C.classify(book, taxonomy or {'bookOverrides': {}}, self.config, self.rules, index, repeated)

    def test_brand_prefix_and_number_are_not_content(self):
        result = self.classify(self.book('Collins Big Cat Pink B/Band 1B: Getting Dressed'))
        self.assertEqual(result['status'], 'title-fallback')
        self.assertIn('clothing.dressing', result['topics'])
        self.assertNotIn('animals', result['topics'])
        self.assertNotIn('arts.instruments', result['topics'])
        self.assertFalse(any(topic.startswith('patterns') for topic in result['topics']))
        self.assertEqual(result['id'], 'test-stable-book')

    def test_clear_secondary_titles_are_retrievable(self):
        cases = {'Ten': 'concepts.counting', 'My Brain': 'body.whole', 'Healthy Snacks': 'food.snacks',
                 'The Aquarium': 'animals.habitats', 'Bridges': 'home.buildings',
                 'Light and Heavy': 'concepts.opposites', 'Old and New': 'concepts.opposites',
                 'Near and Far Away': 'concepts.opposites', 'New Trainers': 'clothing.shoes',
                 'The Foggy Day': 'nature.weather', 'The Hedgehog': 'animals.wild',
                 'Fun with Paper': 'arts.art', 'Applesauce': 'food.fruit', 'Sounds': 'body.senses',
                 'Recycling Plastic': 'nature.protection', 'Round, the Clown': 'arts.performance'}
        for title, topic in cases.items():
            with self.subTest(title=title):
                self.assertIn(topic, self.classify(self.book(title))['topics'])

    def test_explicit_prior_mapping_wins(self):
        book = self.book('A Garden', topicStatus='classification-verified', topics=['food'])
        taxonomy = {'bookOverrides': {book['id']: {'topics': ['food.vegetables'], 'sourceIds': ['original-classification']}}}
        result = self.classify(book, taxonomy=taxonomy)
        self.assertEqual(result['status'], 'preserved')
        self.assertEqual(result['topics'], ['food.vegetables'])

    def test_shared_title_does_not_borrow_other_edition_description(self):
        book = self.book('What Is It?', externalIds={'xiaohuasheng': ['original-guid']})
        description = {'guid': 'different-guid', 'name': 'What Is It?', 'introduction': 'A story about a hungry dinosaur at school.'}
        self.assertEqual(self.classify(book, [description])['status'], 'pending')

    def test_summary_only_repeating_title_stays_title_fallback(self):
        book = self.book('RAZ D44 Imagine the Beach (RAZ D)', externalIds={'xiaohuasheng': ['abc123']})
        description = {'guid': 'abc123', 'name': book['title'], 'introduction': '44 Imagine the Beach (RAZ D)'}
        result = self.classify(book, [description])
        self.assertEqual(result['status'], 'title-fallback')

    def test_marketing_and_bookseller_text_cannot_create_themes(self):
        book = self.book('What Is It?', externalIds={'xiaohuasheng': ['abc123']})
        descriptions = [{'guid': 'abc123', 'name': book['title'], 'introduction':
                         'Ships FAST WITH TRACKING NUMBER! Minor shelf use. The Stage 3 Biff, Chip and Kipper Stories help children to read. '
                         '它旨在帮助孩子找到适合孩子水平的级别，通过在同一级别下的大量阅读逐步提高孩子的阅读能力。'}]
        self.assertEqual(self.classify(book, descriptions)['status'], 'pending')

    def test_real_single_book_summary_precedes_title(self):
        book = self.book('What Is It?', externalIds={'xiaohuasheng': ['abc123']})
        descriptions = [{'guid': 'abc123', 'name': book['title'], 'introduction':
                         'A lost puppy meets a friendly dinosaur at the park.'}]
        result = self.classify(book, descriptions)
        self.assertEqual(result['status'], 'description-derived')
        self.assertIn('animals.dinosaurs', result['topics'])
        self.assertIn('sports.outdoor', result['topics'])
        self.assertEqual(result['evidence'][0]['url'], 'https://www.xiaohuasheng.cn/book/abc123')

    def test_imported_fallback_can_upgrade_without_losing_id(self):
        book = self.book('Birthday Party', topicStatus='title-fallback', externalIds={'xiaohuasheng': ['abc123']})
        taxonomy = {'bookOverrides': {book['id']: {'topics': ['festivals.birthday'], 'status': 'title-fallback',
                         'sourceIds': ['catalog-title-topic-fallback-20261114']}}}
        before = copy.deepcopy(book)
        result = self.classify(book, [{'guid': 'abc123', 'name': book['title'],
                                     'introduction': 'The story is about a young dinosaur making new friends.'}], taxonomy)
        self.assertEqual(result['status'], 'description-derived')
        self.assertIn('animals.dinosaurs', result['topics'])
        self.assertEqual(result['id'], book['id'])
        self.assertEqual(book, before)

    def test_title_idioms_remain_pending_and_no_patterns_are_generated(self):
        for title in ('Hot Dog, Hot Dog', 'Monkey Business', 'Say Cheese', 'Poor Floppy'):
            with self.subTest(title=title):
                self.assertEqual(self.classify(self.book(title))['status'], 'pending')

    def test_root_only_refines_same_parent_without_changing_prior_status(self):
        book = self.book('I am a bee', topicStatus='classification-verified', topics=['animals'])
        before = copy.deepcopy(book)
        taxonomy = {**self.taxonomy, 'bookOverrides': {book['id']: {'topics': ['animals']}}}
        record = C.refine_root_only(book, taxonomy, self.config, self.rules, {}, {})
        self.assertEqual(record['topics'], ['animals.insects'])
        self.assertEqual(record['subtopicStatus'], 'title-fallback')
        self.assertEqual(book, before)
        self.assertNotIn('status', record)

    def test_root_only_never_uses_title_to_expand_another_parent(self):
        book = self.book('A boat', topicStatus='classification-verified', topics=['animals'])
        taxonomy = {**self.taxonomy, 'bookOverrides': {book['id']: {'topics': ['animals']}}}
        self.assertIsNone(C.refine_root_only(book, taxonomy, self.config, self.rules, {}, {}))

    def test_existing_secondary_is_not_refined_and_imported_refinement_is_repeatable(self):
        book = self.book('My Clothes', topicStatus='classification-verified', topics=['clothing'])
        taxonomy = {**self.taxonomy, 'bookOverrides': {book['id']: {'topics': ['clothing.shoes']}}}
        self.assertIsNone(C.refine_root_only(book, taxonomy, self.config, self.rules, {}, {}))
        taxonomy['bookOverrides'][book['id']] = {'topics': ['clothing']}
        first = C.refine_root_only(book, taxonomy, self.config, self.rules, {}, {})
        taxonomy['bookOverrides'][book['id']] = {'topics': ['clothing', *first['topics']], 'subtopicRefinement': first}
        again = C.refine_root_only(book, taxonomy, self.config, self.rules, {}, {})
        self.assertEqual(first, again)


if __name__ == '__main__':
    unittest.main()
