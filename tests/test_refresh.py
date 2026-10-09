import unittest,tempfile,json,hashlib,time,sys
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import source_cache
from refresh_offers import leaflet_dates
from refresh_rules import fingerprint
class RefreshTests(unittest.TestCase):
 def test_japanese_ranges_include_omitted_month_and_year_rollover(self):
  self.assertEqual(leaflet_dates('2026年10月9日〜13日までのチラシ'),('2026-10-09','2026-10-13'))
  self.assertEqual(leaflet_dates('2026年12月30日〜1月3日まで'),('2026-12-30','2027-01-03'))
  self.assertEqual(leaflet_dates('2026年10月10日限り'),('2026-10-10','2026-10-10'))
  self.assertIsNone(leaflet_dates('10/10号 おいしい記念日いっぱい'))
 def test_rule_hash_ignores_script_tokens_but_detects_changed_terms(self):
  self.assertEqual(fingerprint('<p>200円で1pt</p><script>token=1</script>'),fingerprint('<p>200円で1pt</p><script>token=2</script>'))
  self.assertNotEqual(fingerprint('<p>200円で1pt</p>'),fingerprint('<p>100円で1pt</p>'))
 def test_failed_fetch_does_not_refresh_old_cache_metadata(self):
  intended=(source_cache.ROOT/'.source-cache').resolve()
  with tempfile.TemporaryDirectory(dir=intended) as tmp,patch.object(source_cache,'CACHE',Path(tmp)):
   self.assertTrue(Path(tmp).resolve().is_relative_to(intended))
   url='https://example.com/shop';key=hashlib.sha256(url.encode()).hexdigest();path=Path(tmp)/(key+'.json')
   old={'checkedAt':'2026-10-01T00:00:00+00:00','checkedEpoch':0,'sha256':'unchanged','etag':'old'}
   path.write_text(json.dumps(old));(Path(tmp)/(key+'.body')).write_text('old body')
   with patch.object(source_cache,'urlopen',side_effect=HTTPError(url,503,'Unavailable',{},None)):
    with self.assertRaises(HTTPError):source_cache.SourceCache(force=True).get(url)
   self.assertEqual(json.loads(path.read_text()),old)
   with patch.object(source_cache,'urlopen',side_effect=AssertionError('Offline must not fetch')):
    body,meta=source_cache.SourceCache(offline=True).get(url)
   self.assertEqual(body,'old body');self.assertEqual(meta['checkedAt'],old['checkedAt'])
if __name__=='__main__':unittest.main()
