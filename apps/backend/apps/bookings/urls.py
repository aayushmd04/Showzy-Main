from django.urls import path
from . import views

urlpatterns = [
    # Organizers
    path("organizers/", views.organizers, name="organizers-list"),
    path("organizers/<uuid:pk>/", views.organizer_detail, name="organizers-detail"),
    path("organizers/<uuid:pk>/members/", views.add_member, name="organizers-add-member"),

    # Gig applications
    path("gig-applications/", views.apply_to_gig, name="gig-apply"),
    path("gig-applications/<uuid:pk>/review/", views.review_application, name="gig-review"),

    # Booking conversations
    path("conversations/", views.conversations, name="booking-conversations"),
    path("conversations/<uuid:convo_id>/messages/", views.conversation_messages, name="booking-messages"),
    path("conversations/<uuid:convo_id>/offer/", views.make_offer, name="booking-offer"),

    # Offer actions
    path("offers/<uuid:offer_id>/accept/", views.accept_offer, name="offer-accept"),
    path("offers/<uuid:offer_id>/reject/", views.reject_offer, name="offer-reject"),

    # Booking orders (escrow lifecycle)
    path("orders/", views.booking_orders, name="booking-orders"),
    path("orders/<uuid:pk>/", views.booking_order_detail, name="booking-order-detail"),
    path("orders/<uuid:pk>/fund/start/", views.initiate_fund, name="booking-fund-start"),
    path("orders/<uuid:pk>/fund/", views.fund_order, name="booking-fund"),
    path("orders/<uuid:pk>/complete/", views.complete_order, name="booking-complete"),
    path("orders/<uuid:pk>/cancel/", views.cancel_order, name="booking-cancel"),
    path("orders/<uuid:pk>/dispute/", views.raise_dispute, name="booking-dispute"),
    path("orders/<uuid:pk>/reviews/", views.order_reviews, name="booking-reviews"),
    path("orders/<uuid:pk>/ledger/", views.order_ledger, name="booking-ledger"),

    # Admin
    path("admin/overview/", views.admin_overview, name="admin-overview"),
    path("admin/disputes/", views.dispute_queue, name="admin-dispute-queue"),
    path("admin/disputes/<uuid:dispute_id>/resolve/", views.resolve_dispute, name="admin-dispute-resolve"),
    path("admin/flagged-messages/", views.flagged_messages, name="admin-flagged-messages"),
    path("admin/flagged-messages/<uuid:pk>/review/", views.review_flagged_message, name="admin-flagged-message-review"),
    path("admin/ledger/", views.admin_ledger, name="admin-ledger"),
    path("admin/organizers/", views.organizer_kyc_queue, name="admin-organizer-kyc-queue"),
    path("admin/organizers/<uuid:pk>/kyc/", views.set_organizer_kyc, name="admin-organizer-kyc-set"),
]
