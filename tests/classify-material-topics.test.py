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

    def test_adaptation_promotion_does_not_turn_pirate_story_into_film_topic(self):
        book = self.book('Blackbeard the Pirate', externalIds={'xiaohuasheng': ['abc123']})
        result = self.classify(book, [{'guid': 'abc123', 'name': book['title'], 'introduction':
            "Blackbeard the Pirate tells the true story of the famous pirate who terrorized the seas for years. "
            "Blackbeard's true story is the inspiration behind many of the colorful pirates in today's books and movies."}])
        self.assertIn('fantasy.pirates', result['topics'])
        self.assertNotIn('arts.film', result['topics'])

    def test_transport_book_brands_do_not_invent_space_experiment_or_fire_topics(self):
        for title in ['Police Cars (Blastoff! Readers: Mighty Machines) (Blastoff Readers. Level 1)',
                      'Busy Machines: Trucks', 'Trains (Machines with Power!)', 'Fire Truck (Wheelie Books)']:
            with self.subTest(title=title):
                result = self.classify(self.book(title))
                self.assertIn('transport.land', result['topics'])
                self.assertFalse(any(topic.startswith('science.') for topic in result['topics']))

    def test_collection_prefixes_and_publisher_suffixes_do_not_create_subjects(self):
        examples = {'Jump Tadpole Book Graded Level PreK-1 (My Fisrt Animal Books)': 'animals',
                    '彩虹兔Sing Along欢唱童谣第一辑: The Wheels on the Bus': 'transport.land',
                    '新东方—彩虹糖儿童读物: My Shoes': 'clothing.shoes',
                    '我的小小世界 SET2: My Family': 'family.members'}
        for title, expected in examples.items():
            with self.subTest(title=title):
                result = self.classify(self.book(title))
                self.assertIn(expected, result['topics'])
                self.assertNotIn('arts.singing', result['topics'])
                if 'Tadpole' not in title:
                    self.assertFalse(any(t.startswith('animals') for t in result['topics']))

    def test_pure_hello_issue_ids_and_reading_brands_are_not_content(self):
        for title in ('Hello Library No.01', 'Hello Library No.24', 'Hello No.03',
                      'I Can Read! Level 1: Rex'):
            with self.subTest(title=title):
                result = self.classify(self.book(title))
                self.assertEqual(result['status'], 'pending')
                self.assertEqual(result['topics'], [])
        result = self.classify(self.book('Hello Library No.01: A Train'))
        self.assertEqual(result['topics'], ['transport.land'])
        self.assertEqual(self.classify(self.book('Hello!'))['topics'], ['social.greetings'])
        container = self.book('MY ANIMAL COLLECTION', series={'title': 'My Animal Collection'})
        self.assertEqual(self.classify(container)['status'], 'pending')
        actual = self.book('My Animal Collection: My Shoes', series={'title': 'My Animal Collection'})
        self.assertEqual(self.classify(actual)['topics'], ['clothing.shoes'])

    def test_generic_setting_and_names_do_not_create_curriculum_topics(self):
        cases = {'Animal Stars': 'science.space', 'The Lake of Stars': 'science.space',
                 'The Wind and the Sun': 'science.space', "Eggs in the Sun": 'science.space',
                 'The Missing Mummy': 'family.members', 'Mother Teresa': 'family.members',
                 'The Germ Family Finds a New Home': 'family.members',
                 'Mummies in the Morning': 'concepts.time',
                 'The Knight at Dawn': 'concepts.time', 'Happy Birthday, Winnie': 'emotions.happy'}
        for title, unexpected in cases.items():
            with self.subTest(title=title):
                self.assertNotIn(unexpected, self.classify(self.book(title))['topics'])
        self.assertIn('science.space', self.classify(self.book('Our Sun'))['topics'])
        self.assertIn('concepts.time', self.classify(self.book('Day and Night'))['topics'])

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

    def test_clear_catalog_gaps_have_explainable_content_topics(self):
        cases = {'RAZ F17 Battery Power! (RAZ F)': 'science.phenomena',
                 'RAZ C18 All About Earthworms (RAZ C)': 'animals',
                 'Canada (RAZ J)': 'science.geography',
                 'Ancient Egypt (RAZ L)': 'science.history',
                 'Can I Vote? (RAZ M)': 'social.rules',
                 'Where Can the King Pee?': 'daily.toilet',
                 'Being Bilingual (RAZ J)': 'concepts.language',
                 'Oxford Reading Tree 4-4: The Secret Room': 'home.rooms',
                 "What’s It Made of": 'science.materials',
                 'We Do Yoga (RAZ F)': 'sports'}
        for title, topic in cases.items():
            with self.subTest(title=title):
                result = self.classify(self.book(title))
                self.assertIn(topic, result['topics'])
                self.assertEqual(result['status'], 'title-fallback')
                self.assertFalse(any(value.startswith('patterns') for value in result['topics']))
        self.assertNotIn('animals.insects', self.classify(self.book('All About Earthworms'))['topics'])
        self.assertNotIn('animals.wild', self.classify(self.book('Water Bears'))['topics'])

    def test_character_names_idioms_and_untargeted_rules_stay_unclassified(self):
        for title in ('Fern Goes Away', 'Bob Bilby (Bluey)', 'Rat-a-tat-tat',
                      'Lots of Hearts', 'Making Waves', 'Rex', 'New Rule!', 'Standing Tall',
                      'The Quizzical Question', 'Max Wants to Fly'):
            with self.subTest(title=title):
                self.assertEqual(self.classify(self.book(title))['status'], 'pending')

    def test_incidental_description_words_are_not_book_or_work_topics(self):
        book = self.book('What Is It?', externalIds={'xiaohuasheng': ['abc123']})
        result = self.classify(book, [{'guid': 'abc123', 'name': book['title'],
                                     'introduction': 'This book introduces his work opposing segregation laws and racism.'}])
        self.assertEqual(result['topics'], ['social.rules'])

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

    def test_each_root_is_refined_without_replacing_an_existing_child(self):
        book = self.book('A crocodile and a bicycle', topicStatus='classification-verified',
                         topics=['animals', 'animals.insects', 'transport'])
        taxonomy = {**self.taxonomy, 'bookOverrides': {}}
        before = copy.deepcopy(book)
        record = C.refine_root_only(book, taxonomy, self.config, self.rules, {}, {})
        self.assertEqual(record['topics'], ['transport.land'])
        self.assertEqual(book, before)

    def test_distinct_roots_can_use_description_then_title_without_upgrading_title_evidence(self):
        book = self.book('A bee and a bicycle', topics=['animals', 'transport'],
                         externalIds={'xiaohuasheng': ['abc123']})
        index, repeated = C.description_index([{'guid': 'abc123', 'name': book['title'],
                                               'introduction': 'A curious bee explores the world around her.'}])
        record = C.refine_root_only(book, {**self.taxonomy, 'bookOverrides': {}},
                                    self.config, self.rules, index, repeated)
        self.assertEqual(record['topics'], ['animals.insects', 'transport.land'])
        self.assertEqual(record['subtopicStatus'], 'title-fallback')
        self.assertEqual([item['kind'] for item in record['evidence']], ['content-description', 'title-fallback'])
        self.assertNotIn('status', record)


if __name__ == '__main__':
    unittest.main()
