# Intent — weft

A public, full-scale test of the Attorn framework: a small programming
language built end to end by an autonomous fleet on the cheapest available
model, with every claim mutation-tested and every credential brokered.

Most sensitive behaviors: user faults must always surface as WeftError with
positions (never raw JS errors), and tail calls must run in constant stack.

The epic plans in plans/ are the operator's task list; claims are activated
per epic; the async mutation gate on CI rules on every epic's claims.
