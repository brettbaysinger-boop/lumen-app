import ast
from pathlib import Path
import unittest


# Execute the actual pure prompt builder without importing network/model providers.
source = ast.parse((Path(__file__).parents[1] / 'lumen/runtime.py').read_text())
builder = next(node for node in ast.walk(source)
               if isinstance(node, ast.FunctionDef) and node.name == '_build_system_prompt')
builder.decorator_list = []
namespace = {}
exec(compile(ast.fix_missing_locations(ast.Module(body=[builder], type_ignores=[])),
             'runtime-prompt', 'exec'), namespace)
build_prompt = namespace['_build_system_prompt']


class CompanionCreationPromptTests(unittest.TestCase):
    def test_custom_identity_reaches_the_conversation_prompt(self):
        prompt = build_prompt({'name': 'Sol', 'pronouns': 'they/them', 'gender': 'nonbinary',
                              'persona': 'Playful and curious', 'visual_identity': 'Silver hair'}, None, [])
        self.assertIn('You are Sol,', prompt)
        self.assertIn('Pronouns: they/them', prompt)
        self.assertIn('Playful and curious', prompt)
        self.assertIn('Appearance: Silver hair', prompt)

    def test_legacy_companions_work_without_a_pronouns_column(self):
        prompt = build_prompt({'name': 'Lumen'}, None, [])
        self.assertIn('You are Lumen,', prompt)
        self.assertIn('Pronouns: not specified', prompt)
