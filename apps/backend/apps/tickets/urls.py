from django.urls import path
from . import views, gate

urlpatterns = [
    path("events/<uuid:event_id>/zones/", views.event_zones, name="event-zones"),
    path("ticket-orders/", views.create_order, name="orders-create"),
    path("ticket-orders/mine/", views.my_orders, name="orders-mine"),
    path("ticket-orders/<uuid:pk>/invoice/", views.order_invoice, name="orders-invoice"),
    path("tickets/mine/", views.my_tickets, name="tickets-mine"),
    path("tickets/<uuid:pk>/", views.ticket_detail, name="tickets-detail"),
    path("tickets/<uuid:pk>/cancel/", views.cancel_ticket, name="tickets-cancel"),
    path("tickets/<uuid:pk>/transfer/", views.transfer_ticket, name="tickets-transfer"),
    path("events/<uuid:event_id>/attendees/", views.event_attendees, name="event-attendees"),
    path("tickets/scan/<uuid:qr_data>/", views.scan_ticket, name="tickets-scan"),
    path("events/<uuid:event_id>/gate/", gate.gate_overview, name="gate-overview"),
    path("events/<uuid:event_id>/gate/invite/", gate.gate_invite, name="gate-invite"),
    path("events/<uuid:event_id>/gate/<uuid:assignment_id>/", gate.gate_revoke, name="gate-revoke"),
    path("gate/mine/", gate.gate_mine, name="gate-mine"),
    path("gate/invitations/<uuid:assignment_id>/accept/", gate.gate_accept, name="gate-accept"),
    path("gate/invitations/<uuid:assignment_id>/decline/", gate.gate_decline, name="gate-decline"),
    path("promo/validate/", views.validate_promo, name="promo-validate"),
]
