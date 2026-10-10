"""Bounded, explicit references to one earlier user request; no assistant facts."""
import json
import re
from uuid import UUID

MAX_PREVIOUS_REQUEST_CHARS = 4000


class ProposalContextError(ValueError):
    """Static reason only. Never include request content in an error."""


def references_previous_request(text):
    for sentence in re.split(r'[.!?\n]+', text):
        if re.search(r"\b(?:(?:do not|don't)\s+(?:use|reuse|include|rely on)|ignore|disregard|without)\s+(?:details\s+from\s+)?(?:my|the)\s+(?:previous|last)\s+(?:message|request)\b", sentence, re.I):
            continue
        if re.search(r'\b(?:my|the)\s+(?:previous|last)\s+(?:message|request)\b', sentence, re.I):
            return True
    return False


def previous_request(query, recent):
    """recent is the runtime's newest-first history for this conversation."""
    if not references_previous_request(query):
        return None
    row = next((row for row in (recent or []) if row.get('role') == 'user'), None)
    if not row or not isinstance(row.get('content'), str) or not row['content'].strip():
        raise ProposalContextError('previous_request_unavailable')
    content = row['content'].strip()
    if len(content) > MAX_PREVIOUS_REQUEST_CHARS:
        raise ProposalContextError('previous_request_too_long')
    # Do not recursively gather older jobs or silently skip an intervening turn.
    if references_previous_request(content):
        raise ProposalContextError('previous_request_is_reference')
    try:
        message_id = str(UUID(str(row['id'])))
    except (KeyError, ValueError, TypeError, AttributeError):
        raise ProposalContextError('previous_request_id_unavailable') from None
    return {'id': message_id, 'content': content}


def proposal_request(query, previous=None):
    """The same explicit user inputs authorize prices in drafting and export."""
    if previous is None:
        return query
    return json.dumps({'current_request': query, 'previous_user_request': previous}, ensure_ascii=False)


JOB_REFERENCE_RULES = (
    'Determine whether the user is improving the SAME job or creating a NEW job. '
    'For a new job, reference documents supply examples of organization and only '
    'applicable company or service terms; they do not supply the new customer identity '
    'or authorize copying the entire old scope. '
    'Use current_request/request as the controlling instructions. If a '
    'previous_user_request is supplied, it is the one earlier USER message explicitly '
    'referenced by this request, not an assistant-generated proposal. Current '
    'instructions override earlier details. Do not use a previous customer address '
    'or contact details for a different named customer unless explicitly retained. '
    'For new jobs, exclude old customer names, signatures, addresses, contacts, '
    'proposal numbers and dates from every section including acceptance. '
    'Separate reusable layout and company information from job-specific facts. '
    'A cited term can still be inapplicable: retain a treatment method, exclusion, '
    'warranty, preparation duty or discount condition only when it applies to the '
    'services actually requested. Keep each term attached to its own service in '
    'mixed-service jobs. Do not add unrelated work to justify a citation. '
    'Preserve all explicit new scope, quantities, durations, prices, complimentary '
    'items, bundle conditions and recurring-service options. Do not replace '
    'supplied details with confirmation placeholders. Never extend or invent '
    'guarantees. Preserve applicable source limitations in meaning. '
    'For same-job edits, preserve existing job details unless the user changes them. '
    'If the reference does not support an applicable term, omit it or mark the '
    'missing term [NEEDS CONFIRMATION]. Do not manufacture citations. '
)
