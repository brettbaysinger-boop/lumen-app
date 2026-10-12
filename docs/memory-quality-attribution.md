# Memory attribution and durability guardrails

Natural memory extraction uses the current user message as the only admissible evidence.
Up to six prior conversation messages may be supplied only to resolve references and
ownership. Context must never become evidence for a new memory.

Each proposed candidate declares whether it is durable long-term information. Immediate
result feedback and transient reactions are ignored instead of entering the review inbox.
A small deterministic fallback also rejects short unknown episodic feedback such as
"still wrong" or "try again".

High-confidence subject/content contradictions are rejected before proposal creation.
The database review RPC repeats the same class of checks so another client cannot approve
a proposal whose selected ownership contradicts its wording. The Memories UI performs
the check before approval, direct wording edits, or changing a saved memory's subject.

These checks are intentionally conservative. Relationship memories may be shared even
when their wording begins with the user's action, and ambiguous ownership remains a
review problem rather than an automatic rewrite.
## Identity model

The memory system is account- and companion-generic.

"The user" means the authenticated end user who owns the companion. Companion-owned
wording uses the current companion's stored name at runtime. No production attribution
rule may depend on a particular person's name or on the literal name "Lumen".

Tests deliberately use multiple companion names so accidental product-specific
hard-coding is caught before deployment.
