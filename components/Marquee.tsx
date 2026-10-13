const words = ["TAG IT ON", "DON'T TROLL", "STAY FRESH"];

export default function Marquee() {
  const track = [...words, ...words, ...words];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {track.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
    </div>
  );
}
