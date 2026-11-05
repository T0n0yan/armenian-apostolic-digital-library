# Տեղական (միայն local D1) փորձնական նյութեր վիդեոյի համար. production-ին չի դիպչում։
# Գործարկել՝ pnpm db:migrate:local, հետո python3 scripts/video-guides/seed-local.py [--reset]
import sqlite3, glob, hashlib, json, sys
p = [x for x in glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if 'metadata' not in x][0]
c = sqlite3.connect(p)
if '--reset' in sys.argv:
    for t in ('saved_materials', 'reading_log', 'highlights', 'reading_reminders'):
        c.execute(f"delete from {t} where user_id='local-development'")
    c.commit(); print('reset'); sys.exit(0)
CH = '-1002993860753'
c.execute("insert or ignore into library_sources(chat_id,title,source_type,is_forum) values(?,?,'supergroup',1)", (CH, 'Հայ Առաքելական Սուրբ Եկեղեցի'))
c.execute("insert or ignore into library_topics(id,chat_id,topic_id,slug,title,default_sort,display_order) values('category_prayers',?,21,'pray','Աղոթքներ','number-asc',1)", (CH,))
c.execute("insert or ignore into library_topics(id,chat_id,topic_id,slug,title,default_sort,display_order) values('category_psalms',?,20,'psalms','Սաղմոսներ','number-asc',2)", (CH,))
rows = [
    (90210, 'Աղոթքներ', 'Աղոթքներ\n\nԱյս բաժնում հավաքված են Հայ Առաքելական Եկեղեցու աղոթքները։', None, '07'),
    (90211, 'Տերունական աղոթք', 'Տերունական աղոթք\n\nՀայր մեր, որ յերկինս ես, սուրբ եղիցի անուն քո։ Եկեսցէ արքայութիւն քո։ Եղիցին կամք քո, որպէս յերկինս եւ յերկրի։ Զհաց մեր հանապազորդ տուր մեզ այսօր։ Եւ թող մեզ զպարտիս մեր, որպէս եւ մեք թողումք մերոց պարտապանաց։ Եւ մի տանիր զմեզ ի փորձութիւն, այլ փրկեա զմեզ ի չարէ։ Զի քո է արքայութիւն եւ զօրութիւն եւ փառք յաւիտեանս։ Ամէն։', 1, '08'),
    (90212, 'Սուրբ Աստուած', 'Սուրբ Աստուած\n\nՍուրբ Աստուած, սուրբ եւ հզօր, սուրբ եւ անմահ, որ խաչեցար վասն մեր, ողորմեա՛ մեզ։', 2, '09'),
]
for mid, title, text, num, hour in rows:
    c.execute("""insert or replace into library_materials(chat_id,message_id,material_id,topic_key,topic_id,content_type,title,telegram_url,
      content_text,formatted_text_json,number_value,content_hash,source_revision,sync_state,synced_at,published_at)
      values(?,?,?,'category_prayers',21,'text',?,?,?,?,?,?,'1','ready','2026-11-01',?)""",
      (CH, mid, f'material_tg_n{CH[1:]}_{mid}', title, f'https://t.me/armenian_apostolic_church/{mid}', text,
       json.dumps({'text': text, 'entities': []}, ensure_ascii=False), num, hashlib.sha256(text.encode()).hexdigest(), f'2026-11-01T{hour}:00:00Z'))
c.commit(); print('seeded')
