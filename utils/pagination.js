const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 100;

// Clamps/normalizes whatever came in on the querystring (?page=, ?perPage=)
// into safe integers — never trust these directly in a LIMIT/OFFSET.
function normalizePagination(pagination = {}) {
  let page = parseInt(pagination.page, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  let perPage = parseInt(pagination.perPage, 10);
  if (!Number.isInteger(perPage) || perPage < 1) perPage = pagination.defaultPerPage || DEFAULT_PER_PAGE;
  perPage = Math.min(perPage, MAX_PER_PAGE);
  return { page, perPage, offset: (page - 1) * perPage };
}

function buildPageMeta(total, page, perPage) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return { total, page, perPage, totalPages };
}

module.exports = { normalizePagination, buildPageMeta, DEFAULT_PER_PAGE, MAX_PER_PAGE };
