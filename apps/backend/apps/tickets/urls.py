from django.urls import path
from . import views

urlpatterns = [
    path("orders/", views.create_order, name="orders-create"),
    path("orders/mine/", views.my_orders, name="orders-mine"),
    path("tickets/mine/", views.my_tickets, name="tickets-mine"),
    path("tickets/<uuid:pk>/", views.ticket_detail, name="tickets-detail"),
    path("tickets/scan/<uuid:qr_data>/", views.scan_ticket, name="tickets-scan"),
    path("promo/validate/", views.validate_promo, name="promo-validate"),
]
