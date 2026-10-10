export function TableSurface() {
  return (
    <div className="joker-table-surface pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="joker-table-shell absolute inset-[1.5vh_1.2vw]">
        <div className="joker-table-rail absolute inset-0" />
        <div className="joker-table-wood absolute inset-[clamp(10px,1.55vw,22px)]" />
        <div className="joker-table-felt absolute inset-[clamp(22px,3vw,44px)]">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1600 720"
            preserveAspectRatio="none"
            focusable="false"
          >
            <defs>
              <linearGradient id="joker-felt-line" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(196, 171, 88, 0.15)" />
                <stop offset="50%" stopColor="rgba(196, 171, 88, 0.28)" />
                <stop offset="100%" stopColor="rgba(196, 171, 88, 0.12)" />
              </linearGradient>
            </defs>
            <rect x="115" y="75" width="1370" height="570" rx="160" fill="none" stroke="url(#joker-felt-line)" strokeWidth="2.2" />
            <ellipse cx="800" cy="360" rx="210" ry="106" fill="none" stroke="rgba(196,171,88,.19)" strokeWidth="2" />
            <circle cx="800" cy="360" r="66" fill="none" stroke="rgba(196,171,88,.14)" strokeWidth="2" />
            <path d="M800 318c-14 19-45 35-45 60 0 22 18 37 39 37 11 0 20-4 27-10-5 18-13 31-25 41h49c-12-10-20-23-25-41 7 6 16 10 27 10 21 0 39-15 39-37 0-25-31-41-45-60-14-19-21-31-21-31s-7 12-20 31Z" fill="rgba(196,171,88,.10)" />
            <path d="M525 360h175M900 360h175" stroke="rgba(196,171,88,.12)" strokeWidth="2" strokeLinecap="round" />
            <path d="M510 360l11-7 11 7-11 7-11-7ZM1068 360l11-7 11 7-11 7-11-7Z" fill="rgba(196,171,88,.15)" />
          </svg>
        </div>
        <div className="joker-table-studs absolute inset-0">
          {[
            ["50%", "2.4%"], ["19%", "4.6%"], ["81%", "4.6%"],
            ["4.3%", "37%"], ["95.7%", "37%"],
            ["7.2%", "72%"], ["92.8%", "72%"],
            ["23%", "94.3%"], ["50%", "96%"], ["77%", "94.3%"],
          ].map(([left, top], index) => (
            <span key={index} className="joker-table-stud absolute" style={{ left, top }} />
          ))}
        </div>
      </div>
    </div>
  );
}
