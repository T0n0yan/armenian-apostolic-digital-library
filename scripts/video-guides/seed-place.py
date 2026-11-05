# Տեղական (միայն local D1) Մայր Աթոռ՝ քարտեզի վիդեոյի համար։ Նկարները՝ Wikimedia Commons (2025)՝ R2 local.
# 1՝ «Catedral d'Edjmiatsín.jpg» Lohen11 CC BY 4.0, 2՝ «Etchmiadzin 2025-3.jpg» Yerevantsi CC BY 4.0, 3՝ «Etchmiadzin Cathedral by Jaba1977 03.jpg» Jaba1977 CC BY-SA 4.0
# Նկարները՝ npx wrangler r2 object put armenian-apostolic-library-media-local/places/mayr-ator-surb-ejmiatsin/1.webp --local --file ...
import sqlite3, glob, json
p = [x for x in glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if 'metadata' not in x][0]
c = sqlite3.connect(p)
c.execute("delete from place_visits where user_id='local-development'") if c.execute("select name from sqlite_master where name='place_visits'").fetchone() else None
c.execute("""insert or replace into places(id,name,kind,latitude,longitude,region,description,clergy,services,photos_json,credit_name,verified,published,accessibility,active,liturgy,open_hours)
 values(?,?,?,?,?,?,?,?,?,?,?,0,1,?,?,?,?)""", (
 'mayr-ator-surb-ejmiatsin', 'Մայր Աթոռ Սուրբ Էջմիածին', 'complex', 40.16195, 44.29108, 'Արմավիր',
 'Հայաստանյաց Առաքելական Սուրբ Եկեղեցու հոգևոր կենտրոնը և Ամենայն Հայոց Կաթողիկոսի նստավայրը։ Մայր տաճարը, ըստ ավանդության, կառուցվել է 301–303 թվականներին՝ Սուրբ Գրիգոր Լուսավորչի ձեռքով։',
 'Մայր Աթոռի միաբանություն', '',
 json.dumps(['places/mayr-ator-surb-ejmiatsin/1.webp', 'places/mayr-ator-surb-ejmiatsin/2.webp', 'places/mayr-ator-surb-ejmiatsin/3.webp']), '',
 'Մեքենայով հասանելիություն՝ այո, մինչև եկեղեցի\nՃանապարհ՝ հարթ, ասֆալտապատ\nԹեքահարթակ՝ առկա է\nՄուտք՝ մի քանի աստիճան',
 'yes', 'կիրակի և տոն օրերին', ''))
c.commit(); print('place seeded')
