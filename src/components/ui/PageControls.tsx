export function PageControls({
  page,
  pages,
  onPage,
  label = 'Results',
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  return (
    <nav className="page-controls" aria-label={`${label} pages`}>
      <button
        type="button"
        aria-label={`Previous ${label.toLowerCase()} page`}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span role="status">
        Page {page + 1} of {Math.max(1, pages)}
      </span>
      <button
        type="button"
        aria-label={`Next ${label.toLowerCase()} page`}
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
