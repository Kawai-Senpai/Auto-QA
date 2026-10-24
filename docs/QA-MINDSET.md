# QA mindset: test like the messy real world, not like the developer

Read this before exploring any flow. It is the reason this engine exists.

## In the owner's words

This is the brief this engine was built from, kept whole on purpose. A summary
loses the point; read it as written.

> The reason QA and quality testers are important: when developers test it,
> they know the functionalities the system already has, that's why they just
> try to do what the system can do and the test passes. Whereas QA think from
> outside the box, as a natural user. Because in the real world there are messy
> problems, there are exceptions, there are uniqueness to the rules, there is a
> lot of noise.
>
> Let's say a form has specific information that is mandatory. Maybe in the
> real world we don't have that information. Maybe we don't even have a
> number or email of the client. There is nothing. Probably there is nothing
> of the client. What happens then? We need a way out for that, because
> testing is not only about finding bugs, but about finding new features and
> improvements to do, exceptions to do. Like changing the flow and things like
> that. That is also really, really necessary.
>
> What if the client wants to do this step before this step? What if that is
> also uniqueness? What if the steps need to be mangled and reordered because
> this is an exceptional case? Our platform might fail in that scenario. What
> if they want to do something that they already did? Is there a way to
> backtrack?
>
> These are some examples, but understand the philosophy. This is the
> exceptional case. We have to look at it from outside the box, like a normal
> user. What happens if the same system is all of a sudden, tomorrow, used by
> a different agency or a different user who has 10,000 customers per day?
> What happens then? Will it break? There is so much uniqueness, so many
> exceptions, so much noise. Keep this in mind while doing it.

And on the bar for what counts as done, after reviewing an email that worked
but was only "okay":

> This is okay. I would say this is 75% there. I like the direction, but it
> doesn't look that polished, and it doesn't give me an eye-shining eureka
> moment. This is the kind of testing you need to do.

So "it works and nothing is broken" is not a pass. Judge every screen and every
email the way the client will meet it: is it polished, does it feel premium,
would someone smile at it? If something is off and you cannot name it, keep
looking until you can, and say what it is.

## Why a developer's test passes and a real user's day breaks

A developer tests what the system already does. They know the happy path,
they type the fields the form expects, they click the steps in the order they
built them, and the test passes. That proves very little.

A real user arrives from outside. Their world is noisy: information is
missing, rules have exceptions, steps happen out of order, mistakes get made
and need undoing, and the volume is not what anyone planned for. QA's job is
to be that user, on purpose.

Testing is not only finding bugs. It is finding:

- **bugs**: it breaks, it lies, it loses data;
- **missing ways out**: the user is stuck with no path forward;
- **improvements**: it works, but a real person would trip, hesitate or give up;
- **new features**: the real world needs something the system never imagined.

Record all four. A finding with no crash is still a finding.

## The questions to ask of every flow

Ask these, then actually try them in the browser. Do not just think them.

### Missing and imperfect information
- What if a "required" field is simply unknown? A client with no phone, no
  email, no company website, no tax number, no address. Is there a way to save
  what we do know and fill the rest later, or is the user blocked?
- What if the data is wrong in a normal way: an email at a reserved domain, a
  name with an apostrophe or accents, a phone with spaces and a country code,
  a company with no legal name yet, a price of zero, a 2,000-word paste?
- What if the person exists twice (two emails, two companies, a typo)?
- Does every error say, in plain words, what to do next? A raw validator
  message ("value is not a valid email address: the part after the @-sign is
  a special-use name") is a defect even when the validation is right.

### Order, exceptions and backtracking
- What if the client wants step 4 before step 3 (sign before the scope is
  final, pay before the invoice exists, start work before the contract)? Is
  there an override, and is it recorded, or does the system forbid real life?
- What if a step must be skipped, repeated or reordered for one exceptional
  client while the normal flow stays as is?
- What if they want to undo something already done: un-send, un-sign,
  re-open, reverse a payment, restore a deleted item, change a decision?
  Is there a way back, and does it leave a trail?
- What if two people act on the same thing at the same time, or the same
  person in two tabs?
- What if the user stops halfway and comes back next week? Is their work kept?

### Who is using it
- Someone who has never seen the product, on a phone, with a slow network.
- Someone with no account yet, someone whose access was removed, someone who
  is client and staff at once, someone from another company who should see
  nothing.
- What does each person see in their inbox, and does every link they get work
  for them specifically?

### Scale and a different customer tomorrow
- What if the same system were used tomorrow by a different business: another
  country, another currency, another tax regime, another language of work?
  Are country-specific things (GST, Indian number grouping) shown to everyone?
- What if they had 10,000 customers a day instead of ten? Lists without
  paging, searches without limits, emails sent one by one in a request,
  reports computed on every page view: find the ones that would fall over and
  say so, with the evidence.
- What if there is nothing at all yet (empty states) and what if there is far
  too much (long names, 200 rows, 40 attachments)?

## Walk one real journey across every person

The Northwind journey (24 Oct 2026) found defects that isolated screen checks
missed: a paid client's project still said the scope was being agreed, a fixed
bug left its delivery task open, the next step still asked for payment, and an
open editor restored old values over a newer change. Use the method below on
the target product's own fixtures and requirements. The example is evidence
for how to explore, not a requirement for every application.

### Before the first step

Choose one disposable customer and a realistic outcome, from the first request
through delivery, handover and follow-up. Write the chronological steps and
identify each person involved: for example client, sales, operations, engineer
and accounts. Map those to the configured test accounts and approved role
states. Keep separate browser contexts for people; changing a label in the UI
does not prove their permissions. Record missing accounts or unavailable
capture services as coverage gaps, never as passing checks.

Use a local email capture service such as Mailpit. Discover its configured URL
and verify the application is actually sending to it. A database row marked
sent is not proof the capture service received an email. Do not send QA mail to
real recipients, and do not silently substitute live payments for fixtures.

### After every meaningful step

Act as the person who would do that step in real life. Before the next person
acts, read what every affected person now sees:

- Their Today or equivalent home page and outstanding actions.
- The customer's portal page, the engagement or order stage, and the delivery
  project or equivalent object.
- The exact words for where the work is, what happens next, and who owes the
  next move. Check that all views agree with the records and with each other.
  Signed means stop asking for a signature; paid means stop asking for payment;
  work started must not leave the client waiting on themselves.
- The emails the step produced. Compare capture IDs before and after, count
  messages per recipient, and read every new message's subject, text and HTML.
  Check facts, amounts, next steps, role-specific links, phone rendering and
  unnecessary repetition. For an action that should send nothing, verify zero.
  If news is intentionally grouped, check its queued or digest state and later
  delivery using the supported job or clock controls; do not sleep and assume.

Keep a step ledger with actor, action, requirement source, affected observers,
each observer's stage/next step/waiting on, expected and actual email counts,
evidence references, and findings. This is what makes disagreement visible.

### Deliberately disturb the journey

- Leave an editor open, change the same object in another tab, through the API
  or through MCP, then save or let autosave run in the first tab. Verify the
  approved conflict behavior and persisted values. An old page must not silently
  restore a deleted tax or overwrite a colleague's new work. Test a same-period
  billing action from two places too, including a retry after an uncertain result.
- Use money cases the product supports: a foreign customer and explicit tax
  choices, no tax, unsent drafts, partial payments, fixed and repeating periods,
  duplicate billing of the same period, and fractional amounts that expose
  rounding. Compare the quote, billing plan, invoice, portal totals and email;
  no draft may appear as a client debt merely because staff can see it. Source
  the exact tax and rounding expectations from requirements, not geography.
- Switch to both permitted and forbidden people, including an unrelated
  customer, unassigned staff and someone whose access ended. Check direct
  URLs, API responses and email links as well as hidden controls. Check internal
  notes, drafts and amounts for leaks. Never treat a missing button as proof of
  authorization.
- Skip, repeat, reorder, pause, resume and undo steps using approved fixtures.
  Missing information and exceptional deals should expose a usable way forward
  or a clearly recorded product decision.

### Turn findings into repeatable coverage

Explore the whole journey first; retain its ledger as context. Once requirements
confirm the expected behavior, split the confirmed journey and its regressions
into focused structured scenarios with deterministic fixtures and meaningful
visible and side-effect assertions. Use the existing compiler, static audit,
type check, repeated clean runs and negative validation. Do not replace these
with a giant manual script, and do not invent unsupported scenario fields or
assume multi-context actions can be compiled. If a boundary is not expressible,
record the coverage gap and use the harness's approved-test path or a separate
reviewed enhancement. Unresolved expectations stay discoveries.

## How to record what you find

For each finding write: where (route/object and acting role), what you did,
what was seen, what a real user needed,
and which kind it is (bug, no way out, improvement, feature). Put evidence
next to it: the screen, the request, the email. Fix what is in scope; list
the rest for a decision. An exceptional case nobody can handle today is a
product decision, not a test to delete.

## Guardrails still apply

None of this loosens the rules in `AGENTS.md`: an assertion still needs a
source of truth, and observed behaviour is never promoted to "expected" just
because it happened. The mindset decides **what to try**; the requirements
decide **what is correct**. Where no requirement covers an exceptional case,
that gap is itself the finding.
