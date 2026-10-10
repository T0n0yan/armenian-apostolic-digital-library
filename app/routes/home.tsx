import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան" },
    {
      name: "description",
      content: "Հայ Առաքելական Սուրբ Եկեղեցուն նվիրված թվային գրադարան։",
    },
  ];
}

export default function Home() {
  return (
    <main className="foundation-page">
      <section className="foundation-card" aria-labelledby="page-title">
        <p className="foundation-kicker">Նախագծի հիմք</p>
        <h1 id="page-title">Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան</h1>
        <p>Առաջին տեխնիկական քայլը պատրաստ է։</p>
      </section>
    </main>
  );
}
