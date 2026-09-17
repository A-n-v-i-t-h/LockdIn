const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  train: "M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11",
  plan: "M10 6.5h10M10 12h10M10 17.5h10M3.8 6.3l1.3 1.3 2.3-2.4M3.8 11.8l1.3 1.3 2.3-2.4M3.8 17.3l1.3 1.3 2.3-2.4",
  cal: "M4 6.5h16V20H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4",
  journal: "M6 3.5h10.5a2.5 2.5 0 0 1 2.5 2.5v14.5H8.5A2.5 2.5 0 0 1 6 18zM6 18a2.5 2.5 0 0 1 2.5-2.5H19M10 8h5",
  flame: "M12 2.8c.8 3.1 5.2 5.1 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.6 1.4-4.3 2.5-5.3.3 1.9 1.3 3.2 2.3 3.3-.3-3.1-.6-5.4.4-8.2z",
  moon: "M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z",
  swap: "M7 7.5h12l-3.2-3.2M17 16.5H5l3.2 3.2",
  timer: "M12 8.5v4.5l2.8 1.8M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM9.5 2.5h5",
  check: "M5 12.5l4.3 4.3L19 7.3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  chev: "M9.5 6l6 6-6 6",
  back: "M14.5 6l-6 6 6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  bolt: "M13.2 2.8 5 13.2h6.1l-1 8 8.1-10.4h-6.1z",
  trophy: "M8 4h8v5.2a4 4 0 0 1-8 0zM8 6H5.2a3 3 0 0 0 3.1 3.9M16 6h2.8a3 3 0 0 1-3.1 3.9M12 13.2V17M8.5 20.5h7M9.5 17h5",
  lock: "M6 11h12v9.5H6zM8.8 11V8a3.2 3.2 0 0 1 6.4 0v3",
  food: "M7 3v7.5M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 10.5V21M17 21V3c-2.2 1.3-3.3 3.8-3.3 7.5v3H17",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.5-1.9-.6a7.5 7.5 0 0 1-2 1.2l-.4 2h-4l-.4-2a7.5 7.5 0 0 1-2-1.2l-1.9.6-2-3.5 1.6-1.2a7.6 7.6 0 0 1 0-3l-1.6-1.2 2-3.5 1.9.6a7.5 7.5 0 0 1 2-1.2l.4-2h4l.4 2a7.5 7.5 0 0 1 2 1.2l1.9-.6 2 3.5-1.6 1.2a7.6 7.6 0 0 1 0 3z",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5",
  edit: "M4 20h4.2L19.5 8.7a2.1 2.1 0 0 0-3-3L5.2 17v3zM14.5 7.7l3 3",
  scale: "M4 20h16V9a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5zM9 10l3 3 3-5",
  tape: "M3 12a7 5 0 1 0 14 0 7 5 0 1 0-14 0M17 12h4v5h-9M10 12h.01",
  camera: "M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  chart: "M4 20V4M4 20h16M8 16l3.5-4 3 2.5L20 8",
  history: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4.5l3 1.8",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01",
  logout: "M14 4.5h5.5v15H14M10 16.5 14.5 12 10 7.5M14.5 12H4",
  download: "M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14",
  note: "M5 4h14v12l-4 4H5zM15 20v-4h4M8.5 9h7M8.5 12.5h5",
  undo: "M9 14 4.5 9.5 9 5M4.5 9.5H15a5 5 0 0 1 0 10h-3",
  play: "M7 4.5v15L19 12z",
  flag: "M5 21V4M5 4h12l-2.5 4L17 12H5",
  star: "M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  stroke = 1.8,
  className,
  label,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
