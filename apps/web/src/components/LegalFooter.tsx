import { Link } from "react-router-dom";

const YEAR = new Date().getFullYear();

export function LegalFooter() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-4 text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
        <div>© {YEAR} ChoreChampz, Inc. · Household task-management tool. Not childcare, therapy, education, or a financial service.</div>
        <nav className="flex flex-wrap gap-x-3 gap-y-1">
          <Link to="/terms" className="hover:underline">
            Terms
          </Link>
          <Link to="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link to="/acceptable-use" className="hover:underline">
            Acceptable Use
          </Link>
          <Link to="/child-safety" className="hover:underline">
            Child Safety
          </Link>
          <Link to="/dmca" className="hover:underline">
            DMCA
          </Link>
        </nav>
      </div>
    </footer>
  );
}
