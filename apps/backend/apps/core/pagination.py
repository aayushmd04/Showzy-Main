from rest_framework.pagination import PageNumberPagination


class FlexiblePageNumberPagination(PageNumberPagination):
    """Pages of 20 by default, but a client may ask for up to 100 (`?page_size=`).

    The website loads the whole catalogue of events, artists and venues to power
    browsing and search. At 20 a page that is one request per 20 rows: a few
    hundred events was a few dozen round trips for every visitor. At 100 it is a
    handful, and each page is cached (see public_cache), so the server mostly
    answers from memory.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
