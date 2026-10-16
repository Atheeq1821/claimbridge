"""Graph tools: every load-bearing Cypher query lives here (see docs/05-cypher-queries.md).

Write tools take `me` (the calling agent id) and only write while that agent holds
the claim's lease (fencing). Tests and scripts may pass me=None to skip the fence.
"""

FENCE = "($me IS NULL OR c.lease_owner = $me)"
