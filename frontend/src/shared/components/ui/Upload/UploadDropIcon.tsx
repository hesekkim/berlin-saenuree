export interface UploadDropIconProps {
  className?: string;
}

/** File silhouette with blue upload badge (dropzone affordance). */
export default function UploadDropIcon({ className }: UploadDropIconProps) {
  return (
    <svg
      className={className}
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 6h16l8 8v26a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        fill="var(--cf-neutral-200, #e5e5e5)"
      />
      <path
        d="M28 6v6a2 2 0 0 0 2 2h6"
        fill="var(--cf-neutral-100, #f5f5f5)"
        stroke="var(--cf-neutral-300, #d4d4d4)"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="34" cy="34" r="11" fill="var(--cf-blue-50, #3c9ece)" />
      <path
        d="M34 28v9M34 28l-3.5 3.5M34 28l3.5 3.5M28.5 39.5h11"
        stroke="var(--cf-white, #fff)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
