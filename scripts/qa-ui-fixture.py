import sqlite3
from pathlib import Path
p=next(p for p in (Path(__file__).resolve().parents[1] / '.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite')
c=sqlite3.connect(p)
import sys
if "--remove" in sys.argv:
 source=c.execute("select title from library_sources where chat_id='-1002993860753'").fetchone()
 assert source == ('QA only',), 'Not a QA-only fixture; refusing removal'
 ids=[90200,90201,90210,90211]
 assert c.execute("select count(*) from library_materials where message_id not in (90200,90201,90210,90211)").fetchone()[0]==0, 'Other data present; refusing removal'
 c.execute("delete from library_materials where chat_id='-1002993860753' and message_id in (90200,90201,90210,90211)")
 c.execute("delete from library_topics where id in ('category_psalms','category_prayers')")
 c.execute("delete from library_sources where chat_id='-1002993860753' and title='QA only'")
 c.commit()
 print('Removed synthetic LOCAL QA rows')
 sys.exit(0)
assert c.execute('select count(*) from library_materials').fetchone()[0]==0, 'Use a separate fixture database when existing content is present'
c.execute("insert into library_sources(chat_id,title,source_type,is_forum) values('-1002993860753','QA only','supergroup',1)")
for topic,name,slug in [('category_psalms','Սաղմոսներ','qa-psalms'),('category_prayers','Աղոթքներ','qa-prayers')]:
 tid=20 if 'psalms' in topic else 21
 c.execute('insert into library_topics(id,chat_id,topic_id,slug,title,default_sort) values(?,?,?,?,?,?)',(topic,'-1002993860753',tid,slug,name,'number-asc'))
 for n in range(2):
  mid=90000+tid*10+n
  title='QA ներածություն' if n==0 else ('Սաղմոս 1' if tid==20 else 'QA աղոթք')
  c.execute("insert into library_materials(chat_id,message_id,material_id,topic_key,topic_id,content_type,title,telegram_url,content_text,number_value,content_hash,source_revision,sync_state,synced_at) values(?,?,?,?,?,'text',?,'https://t.me/example',?,?,?,'1','ready','2026-10-25')",('-1002993860753',mid,f'material_tg_n1002993860753_{mid}',topic,tid,title,'QA synthetic text',1 if tid==20 and n==1 else None,'a'*64))
c.commit()
print('Seeded four synthetic LOCAL QA rows')
