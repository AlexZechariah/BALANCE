import type { SVGProps } from "react";

export function BalanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="64"
      height="64"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Balance receipt verification icon"
      {...props}
    >
      <path
        d="M22 10 h20 a4 4 0 0 1 4 4 v32 l-8 8 H22 a4 4 0 0 1 -4 -4 V14 a4 4 0 0 1 4 -4 Z"
        fill="#FFFDFA"
        stroke="#106A53"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="46,46 38,46 38,54"
        fill="none"
        stroke="#106A53"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="26"
        y1="24"
        x2="38"
        y2="24"
        stroke="#106A53"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="26"
        y1="32"
        x2="32"
        y2="32"
        stroke="#106A53"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <polyline
        points="26,44 30,48 38,40"
        fill="none"
        stroke="#B18827"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
