function facingFor(row, sprite) {
  if (row === 10 || row === 2 || sprite?.includes("walk-left")) return -1;
  return 1;
}

function HeadAccessory({ id, side }) {
  const clipX = side > 0 ? 65 : 35;
  if (id === "none") return null;
  if (id === "ribbon") return <g className="accessory-piece accessory-ribbon" transform={`translate(${clipX} 15)`} stroke="#b96278" strokeWidth="1.5" strokeLinejoin="round"><path d="M0 0 C-12 -10 -17 -3 -10 4 L-1 2 Z" fill="#f4a4b2" /><path d="M1 0 C13 -10 18 -3 11 4 L2 2 Z" fill="#ffd0d7" /><circle cx="0.5" cy="1" r="2.3" fill="#fff0d3" /></g>;
  if (id === "star-crown") return <g className="accessory-piece" stroke="#9b7134" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"><path d="M34 13 Q50 19 66 13 L65 18 Q50 23 35 18 Z" fill="#f3d389" /><path d="M39 13 L42 6 L47 12 L51 4 L55 12 L61 7 L62 15 Z" fill="#fff0bf" /><circle cx="42" cy="11" r="1.1" fill="#e6b34e" /><circle cx="51" cy="9" r="1.2" fill="#e6b34e" /><circle cx="59" cy="11" r="1.1" fill="#e6b34e" /></g>;
  if (id === "flower-aura" || id === "sunflower-crown") {
    const petals = id === "sunflower-crown" ? [34, 42, 50, 58, 66] : [clipX - 4, clipX, clipX + 4];
    return <g className="accessory-piece" stroke="#b96f80" strokeWidth="0.8">{petals.map((x, index) => <g key={x} transform={`translate(${x} ${id === "sunflower-crown" ? 13 : 24})`}><circle cy="-3" r="2.8" fill={index % 2 ? "#ffd0d8" : "#f5a9bb"} /><circle cx="3" r="2.8" fill="#ffd0d8" /><circle cy="3" r="2.8" fill="#f5a9bb" /><circle cx="-3" r="2.8" fill="#ffd0d8" /><circle r="1.8" fill="#f4d47d" /></g>)}</g>;
  }
  if (id === "kitty-headband") return <g className="accessory-piece" stroke="#aa7480" strokeWidth="1.3" strokeLinejoin="round"><path d="M34 20 Q50 7 66 20" fill="none" stroke="#dfa0ad" strokeWidth="2.4" /><path d={`M${clipX - 5} 16 L${clipX - 7} 7 L${clipX} 12 L${clipX + 6} 6 L${clipX + 5} 17 Z`} fill="#ffc6d0" /><path d={`M${clipX - 3} 15 L${clipX - 4} 10 L${clipX} 13 L${clipX + 3} 10 L${clipX + 3} 15 Z`} fill="#f6a7b6" /></g>;
  if (id === "moon-hairpin") return <g className="accessory-piece" transform={`translate(${clipX} 22)`}><path d="M0 -7 A7 7 0 1 0 5 4 A5.5 5.5 0 1 1 0 -7Z" fill="#f4d88c" stroke="#b68a4a" strokeWidth="0.8" /><circle cx="7" cy="-1" r="1.2" fill="#fff2c7" /><circle cx="-7" cy="5" r="1" fill="#edb6bd" /></g>;
  if (id === "round-glasses") return <g className="accessory-piece" fill="none" stroke="#9a7660" strokeWidth="1.1"><circle cx="41" cy="29" r="6.8" /><circle cx="59" cy="29" r="6.8" /><path d="M47.8 29 Q50 27 52.2 29 M34 28 L31 27 M66 28 L69 27" /></g>;
  return null;
}

function NeckAccessory({ id }) {
  if (id === "none") return null;
  if (id === "cloud-scarf") return <g className="accessory-piece" stroke="#7395a8" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round"><path d="M35 39 Q41 42 50 42 Q59 42 65 39 L63 46 Q51 49 38 45 Z" fill="#c8e1ef" /><path d="M58 44 L63 43 L66 53 Q62 55 59 52 Z" fill="#b5d7e8" /><path d="M40 42 Q50 45 61 42" fill="none" stroke="#f5fbff" strokeWidth="1.2" /></g>;
  if (id === "berry-choker") return <g className="accessory-piece" fill="none" stroke="#cc7b89" strokeWidth="1.4"><path d="M39 40 Q50 45 61 40" /><circle cx="50" cy="44" r="2.1" fill="#e98291" stroke="#fff0ec" strokeWidth="0.8" /><circle cx="47" cy="43" r="1" fill="#6baf79" stroke="none" /><circle cx="53" cy="43" r="1" fill="#6baf79" stroke="none" /></g>;
  if (id === "pearl-necklace") return <g className="accessory-piece" fill="#fff8e8" stroke="#c9aa76" strokeWidth="0.65"><path d="M39 40 Q50 49 61 40" fill="none" stroke="#c9aa76" strokeWidth="1" />{[42, 46, 50, 54, 58].map((x) => <circle key={x} cx={x} cy={x === 50 ? 47 : 40 + Math.round(7 * Math.sin(Math.PI * (x - 39) / 22))} r="1.3" />)}<path d="M50 46 L52 49 L50 52 L48 49 Z" fill="#f2cf76" /></g>;
  return null;
}

function PropAccessory({ id, side }) {
  if (id === "none") return null;
  const x = side > 0 ? 65 : 35;
  if (id === "heart-bag" || id === "strawberry-purse") return <g className="accessory-piece" stroke="#b86d7a" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round"><path d={`M48 42 Q${x} 51 ${x} 61`} fill="none" stroke="#cf8993" strokeWidth="1.6" /><rect x={x - 5.5} y="59" width="11" height="11" rx="3" fill={id === "heart-bag" ? "#f5b8c0" : "#f493a5"} /><path d={id === "heart-bag" ? `M${x} 68 C${x - 5} 64 ${x - 4} 61 ${x} 63 C${x + 4} 61 ${x + 5} 64 ${x} 68` : `M${x - 3} 62 Q${x} 59 ${x + 3} 62 L${x + 2} 67 L${x - 2} 67 Z`} fill="#fff5f1" />{id === "strawberry-purse" && <path d={`M${x - 1} 59 Q${x - 5} 56 ${x - 4} 54 M${x + 1} 59 Q${x + 5} 56 ${x + 4} 54`} fill="none" stroke="#6da572" />}</g>;
  if (id === "cloud-plush") return <g className="accessory-piece" transform={`translate(${x} 50)`} stroke="#83a7b4" strokeWidth="0.8"><path d="M-8 3 C-9 0 -6 -3 -3 -2 C-2 -7 4 -7 5 -3 C10 -4 11 2 7 4 L-5 5 Z" fill="#d9eff4" /><circle cx="-2" cy="1" r="0.8" fill="#6e7d80" stroke="none" /><circle cx="3" cy="1" r="0.8" fill="#6e7d80" stroke="none" /><path d="M-1 3 Q0 4 1 3" fill="none" /></g>;
  if (id === "star-wand") return <g className="accessory-piece" transform={`translate(${x} 51) rotate(${side > 0 ? 18 : -18})`} stroke="#9e7e45" strokeWidth="1"><path d="M0 4 L0 18" stroke="#d4ad67" strokeWidth="2.4" /><path d="M0 -6 L1.8 -1.8 L6 -1 L2.7 1.8 L3.4 6 L0 3.8 L-3.4 6 L-2.7 1.8 L-6 -1 L-1.8 -1.8 Z" fill="#ffe6a0" /><circle cx="4" cy="-5" r="1" fill="#fff0bd" stroke="none" /></g>;
  if (id === "heart-cape") return <g className="accessory-piece" fill="none" stroke="#d18493" strokeWidth="1.2" strokeLinejoin="round"><path d="M38 39 Q31 42 33 54 Q39 57 43 48 M62 39 Q69 42 67 54 Q61 57 57 48" fill="#f6c7cf" /><path d="M35 45 Q38 48 40 46 M65 45 Q62 48 60 46" stroke="#fff3ed" /></g>;
  return null;
}

export function WardrobeOverlay({ accessories, accessoryId = "none", row, sprite }) {
  const side = facingFor(row, sprite);
  const slots = accessories || { head: accessoryId, neck: "none", prop: "none" };
  if (!slots.head && !slots.neck && !slots.prop) return null;
  return (
    <svg className="wardrobe-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <HeadAccessory id={slots.head || "none"} side={side} />
      <NeckAccessory id={slots.neck || "none"} />
      <PropAccessory id={slots.prop || "none"} side={side} />
    </svg>
  );
}
