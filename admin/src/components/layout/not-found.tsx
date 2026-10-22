import { Link } from '../ui/link'

export function NotFound() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <Link to="/login" className="mt-6 inline-block">
        Go to administrator sign-in
      </Link>
    </>
  )
}
