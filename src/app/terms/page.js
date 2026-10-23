
import terms from "@/data/tc.json";

export const metadata = {
  title: "Terms and Conditions | SU VILLA",
  description:
    "Review package inclusions, cancellation terms, child policy, extra bed policy, and privacy information.",
};

function PolicySection({ title, children }) {
  return (
    <section className="border-b border-[#052a50]/10 py-7 last:border-b-0">
      <h2 className="text-xl font-semibold tracking-tight text-[#052a50] sm:text-2xl">
        {title}
      </h2>

      <div className="mt-4 space-y-4 text-sm leading-7 text-[#334155] sm:text-base">
        {children}
      </div>
    </section>
  );
}

function PolicyList({ items }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-[#b18b35]">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#F7FAEE] px-5 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 border-b border-[#052a50]/15 pb-8 sm:mb-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#a17c2d]">
            SU VILLA
          </p>

          <h1 className="text-3xl font-semibold tracking-tight text-[#052a50] sm:text-5xl">
            {terms.title}
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#475569] sm:text-base">
            Please review the following package details, booking conditions,
            cancellation policies, and guest information before making a
            reservation.
          </p>
        </header>

        <div className="rounded-2xl border border-[#052a50]/10 bg-white px-5 shadow-sm sm:px-9">
          <PolicySection title={terms.packageInclusions.title}>
            <PolicyList items={terms.packageInclusions.items} />
          </PolicySection>

          <PolicySection title={terms.cancellationPolicy.title}>
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 font-semibold text-[#052a50]">
                  {terms.cancellationPolicy.standardPeriod.title}
                </h3>
                <PolicyList
                  items={terms.cancellationPolicy.standardPeriod.items}
                />
              </div>

              <div>
                <h3 className="mb-3 font-semibold text-[#052a50]">
                  {terms.cancellationPolicy.festivePeriod.title}
                </h3>
                <PolicyList
                  items={terms.cancellationPolicy.festivePeriod.items}
                />
              </div>

              <div className="rounded-lg bg-[#F7FAEE] p-4">
                <p className="font-semibold text-[#052a50]">
                  General cancellation term
                </p>
                <PolicyList
                  items={terms.cancellationPolicy.generalTerms}
                />
              </div>
            </div>
          </PolicySection>

          <PolicySection title={terms.mealPlan.title}>
            <div className="flex items-center gap-3">
              <span className="font-medium text-[#052a50]">
                {terms.mealPlan.name}
              </span>

              <img
                src={terms.mealPlan.icon}
                alt="Meal plan"
                width="28"
                height="28"
                className="h-7 w-7 object-contain"
              />
            </div>
          </PolicySection>

          <PolicySection title={terms.childPolicy.title}>
            <PolicyList items={terms.childPolicy.items} />
            <p className="rounded-lg bg-[#F7FAEE] p-4 text-sm italic">
              Disclaimer: {terms.childPolicy.disclaimer}
            </p>
          </PolicySection>

          <PolicySection title={terms.extraBedPolicy.title}>
            <p>{terms.extraBedPolicy.introduction}</p>
            <PolicyList items={terms.extraBedPolicy.items} />
            <p className="rounded-lg bg-[#F7FAEE] p-4 text-sm italic">
              Disclaimer: {terms.extraBedPolicy.disclaimer}
            </p>
          </PolicySection>

          <PolicySection title={terms.reservations.title}>
            <p>{terms.reservations.description}</p>

            <div className="space-y-2">
              <p>
                <span className="font-medium text-[#052a50]">Phone: </span>
                <a
                  href={`tel:${terms.reservations.phone.replace(/\s/g, "")}`}
                  className="underline decoration-[#b18b35] underline-offset-4 hover:text-[#a17c2d]"
                >
                  {terms.reservations.phone}
                </a>
              </p>

              <p>
                <span className="font-medium text-[#052a50]">Email: </span>
                <a
                  href={`mailto:${terms.reservations.email}`}
                  className="break-all underline decoration-[#b18b35] underline-offset-4 hover:text-[#a17c2d]"
                >
                  {terms.reservations.email}
                </a>
              </p>
            </div>
          </PolicySection>

          <PolicySection title={terms.privacyStatement.title}>
            <p>{terms.privacyStatement.content}</p>
          </PolicySection>
        </div>

        <footer className="mt-8 text-center text-xs leading-6 text-[#64748b]">
          Please contact the reservations team if you require clarification
          regarding any booking condition.
        </footer>
      </div>
    </main>
  );
}
