"""Dublaj betigi kendi klasorundeki modulleri motor klasorunden once yuklemeli."""
import ast
import os
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2' / 'altyazi_oku.py'


class ModulePathOrderTests(unittest.TestCase):
    def path_setup(self):
        """altyazi_oku.py icindeki ROOT/ENGINE_ROOT sys.path blogunu ayiklar."""
        body = ast.parse(SCRIPT.read_text(encoding='utf-8')).body
        start = next(i for i, node in enumerate(body)
                     if isinstance(node, ast.Assign)
                     and any(getattr(target, 'id', None) == 'ROOT' for target in node.targets))
        end = next(i for i in range(start + 1, len(body))
                   if isinstance(body[i], (ast.Import, ast.ImportFrom)))
        return compile(ast.Module(body=body[start:end], type_ignores=[]), str(SCRIPT), 'exec')

    def test_this_folder_stays_ahead_of_the_engine_folder(self):
        # Betik olarak calistirildiginda betik klasoru sys.path'te kalir ama 0.
        # sirada olmaz; motor klasoru basa eklenince motorun eski dub_plan.py
        # dosyasi buradaki surumu golgeliyordu (parse_srt 1 arguman -> TypeError).
        block = self.path_setup()
        local = str(SCRIPT.parent)
        with tempfile.TemporaryDirectory() as engine:
            (Path(engine) / 'kitap_ortak.py').write_text('', encoding='utf-8')
            saved_path = list(sys.path)
            saved_engine = os.environ.get('VOXCPM_ROOT')
            sys.path[:] = [local] + [entry for entry in saved_path if entry != local]
            os.environ['VOXCPM_ROOT'] = engine
            try:
                exec(block, {'__file__': str(SCRIPT), 'Path': Path, 'os': os, 'sys': sys})
                positions = [sys.path.index(local), sys.path.index(engine)]
                duplicates = sys.path.count(local)
            finally:
                sys.path[:] = saved_path
                if saved_engine is None:
                    os.environ.pop('VOXCPM_ROOT', None)
                else:
                    os.environ['VOXCPM_ROOT'] = saved_engine
        self.assertLess(positions[0], positions[1],
                        'tools/voxcpm2 ayni adli motor modullerinden once gelmeli')
        self.assertEqual(duplicates, 1, 'tekrarlanan sys.path girdisi birakilmamali')


if __name__ == '__main__':
    unittest.main()
