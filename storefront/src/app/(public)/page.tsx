export default function HomePage() {
  return (
    <section aria-labelledby="welcome-title" className="max-w-2xl">
      <div
        aria-hidden="true"
        className="mb-8 h-1 w-12 bg-brand"
      />
      <h1
        id="welcome-title"
        className="text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Ready for your next game.
      </h1>
      <p
        className="mt-6 max-w-lg text-lg leading-relaxed text-text-muted"
      >
        SportZone is getting ready. Our online store will be here soon.
      </p>
    </section>
  )
}
