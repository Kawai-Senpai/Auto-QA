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

## How to record what you find

For each finding write: what you did, what happened, what a real user needed,
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
