from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal


class Command(BaseCommand):
    help = "Seed the database with realistic Naada demo data"

    def handle(self, *args, **options):
        from apps.core.models import City, Area, Genre
        from apps.venues.models import Venue
        from apps.artists.models import Artist
        from apps.events.models import Event, EventStatus, EventArtist
        from apps.tickets.models import TicketTier

        User = get_user_model()

        self.stdout.write("Seeding cities...")
        blr, _ = City.objects.get_or_create(name="Bengaluru", defaults={"name_kn": "ಬೆಂಗಳೂರು", "slug": "bengaluru"})
        mys, _ = City.objects.get_or_create(name="Mysuru", defaults={"name_kn": "ಮೈಸೂರು", "slug": "mysuru"})

        self.stdout.write("Seeding areas...")
        areas_blr = [
            ("Koramangala", "ಕೋರಮಂಗಲ", "koramangala"),
            ("Indiranagar", "ಇಂದಿರಾ ನಗರ", "indiranagar"),
            ("Jayanagar", "ಜಯನಗರ", "jayanagar"),
            ("Basavanagudi", "ಬಸವನಗುಡಿ", "basavanagudi"),
        ]
        areas_mys = [
            ("VV Mohalla", "ವಿ.ವಿ. ಮೊಹಲ್ಲಾ", "vv-mohalla"),
            ("Gokulam", "ಗೋಕುಲಂ", "gokulam"),
            ("Jayalakshmipuram", "ಜಯಲಕ್ಷ್ಮೀಪುರಂ", "jayalakshmipuram"),
        ]
        blr_area_objs = {}
        for name, name_kn, slug in areas_blr:
            a, _ = Area.objects.get_or_create(city=blr, slug=slug, defaults={"name": name, "name_kn": name_kn})
            blr_area_objs[slug] = a
        mys_area_objs = {}
        for name, name_kn, slug in areas_mys:
            a, _ = Area.objects.get_or_create(city=mys, slug=slug, defaults={"name": name, "name_kn": name_kn})
            mys_area_objs[slug] = a

        self.stdout.write("Seeding genres...")
        genres_data = [
            ("Open Mic", "ಓಪನ್ ಮಿಕ್", "open-mic", "🎤", "#C4472E", 1),
            ("Blues", "ಬ್ಲೂಸ್", "blues", "🎸", "#2563EB", 2),
            ("Jazz", "ಜಾಝ್", "jazz", "🎷", "#D97706", 3),
            ("Folk", "ಜಾನಪದ", "folk", "🪕", "#16A34A", 4),
            ("Carnatic Fusion", "ಕರ್ನಾಟಕ ಫ್ಯೂಷನ್", "carnatic-fusion", "🎵", "#7C3AED", 5),
            ("Rock", "ರಾಕ್", "rock", "🤘", "#DC2626", 6),
            ("Indie", "ಇಂಡಿ", "indie", "🎶", "#0891B2", 7),
            ("Classical", "ಶಾಸ್ತ್ರೀಯ", "classical", "🪘", "#9D174D", 8),
        ]
        genre_objs = {}
        for name, name_kn, slug, icon, color, order in genres_data:
            g, _ = Genre.objects.get_or_create(slug=slug, defaults={
                "name": name, "name_kn": name_kn, "icon": icon, "color": color, "sort_order": order
            })
            genre_objs[slug] = g

        self.stdout.write("Seeding users...")
        admin_user, _ = User.objects.get_or_create(
            email="admin@naada.live",
            defaults={"full_name": "Naada Admin", "role": "admin",
                      "is_staff": True, "is_superuser": True, "is_verified": True}
        )
        if _:
            admin_user.set_password("naada@admin123")
            admin_user.save()

        venue_owner, _ = User.objects.get_or_create(
            email="venue@naada.live",
            defaults={"full_name": "Priya Sharma", "role": "venue_owner", "is_verified": True, "city": mys}
        )
        artist_user, _ = User.objects.get_or_create(
            email="artist@naada.live",
            defaults={"full_name": "Rahul Venkat", "role": "artist", "is_verified": True, "city": blr}
        )
        fan_user, _ = User.objects.get_or_create(
            email="fan@naada.live",
            defaults={"full_name": "Meera Krishnan", "role": "listener", "is_verified": True, "city": mys}
        )

        # Extra artist users
        artist2_user, _ = User.objects.get_or_create(
            email="meghana@naada.live",
            defaults={"full_name": "Meghana K", "role": "artist", "is_verified": True, "city": mys}
        )
        artist3_user, _ = User.objects.get_or_create(
            email="krishna@naada.live",
            defaults={"full_name": "Krishna Rao", "role": "artist", "is_verified": True, "city": blr}
        )
        artist4_user, _ = User.objects.get_or_create(
            email="divya@naada.live",
            defaults={"full_name": "Divya Nair", "role": "artist", "is_verified": True, "city": mys}
        )

        self.stdout.write("Seeding venues...")
        v1, _ = Venue.objects.get_or_create(
            slug="gokulam-music-hall",
            defaults=dict(
                owner=venue_owner, name="Gokulam Music Hall", name_kn="ಗೋಕುಲಂ ಸಂಗೀತ ಭವನ",
                tagline="Mysuru's home for grassroots live music",
                description="A 120-seat intimate venue in the heart of Gokulam with a warm acoustic stage.",
                address_line1="12, 4th Main, Gokulam 3rd Stage", area=mys_area_objs["gokulam"],
                city=mys, pincode="570002", lat=Decimal("12.3260"), lng=Decimal("76.6247"),
                capacity=120, stage_type="indoor", has_sound_system=True, has_bar=True,
                is_active=True, contact_email="hello@gokulammusichal.com", instagram="gokulammusichal",
            )
        )
        v2, _ = Venue.objects.get_or_create(
            slug="rangashankara-koramangala",
            defaults=dict(
                owner=admin_user, name="Rangashankara", name_kn="ರಂಗಶಂಕರ",
                tagline="Bengaluru's landmark performance space",
                description="300-seat proscenium stage in Koramangala. Theatre, music, spoken word.",
                address_line1="36/2, 8th Cross, JP Nagar Phase 2", area=blr_area_objs["koramangala"],
                city=blr, pincode="560078", capacity=300, stage_type="indoor",
                has_parking=True, has_ac=True, has_sound_system=True, has_projector=True,
                is_active=True, is_verified=True, contact_email="info@rangashankara.org",
                lat=Decimal("12.9197"), lng=Decimal("77.5901"),
            )
        )
        v3, _ = Venue.objects.get_or_create(
            slug="vv-mohalla-cultural-centre",
            defaults=dict(
                owner=venue_owner, name="VV Mohalla Cultural Centre", name_kn="ವಿ.ವಿ. ಮೊಹಲ್ಲಾ ಸಾಂಸ್ಕೃತಿಕ ಕೇಂದ್ರ",
                tagline="Celebrating Mysuru's classical heritage",
                description="An intimate 80-seat cultural centre in VV Mohalla, home to classical and folk performances.",
                address_line1="45, VV Mohalla Main Road", area=mys_area_objs["vv-mohalla"],
                city=mys, pincode="570002", lat=Decimal("12.3049"), lng=Decimal("76.6419"),
                capacity=80, stage_type="indoor", has_sound_system=True,
                is_active=True, contact_email="vvmcc@naada.live",
            )
        )

        self.stdout.write("Seeding artists...")
        a1, created_a1 = Artist.objects.get_or_create(
            user=artist_user,
            defaults=dict(
                stage_name="Rahul & The Mysore Blues",
                stage_name_kn="ರಾಹುಲ್ & ದಿ ಮೈಸೂರ್ ಬ್ಲೂಸ್",
                bio="Blues-rock trio from Mysuru blending Carnatic scales with Chicago blues.",
                city=blr, is_active=True, is_featured=True,
                instagram="rahulmysoreblues", booking_email="book@rahulblues.com",
                booking_fee_min=Decimal("5000"), booking_fee_max=Decimal("25000"),
            )
        )
        if created_a1:
            a1.genres.add(genre_objs["blues"], genre_objs["carnatic-fusion"])

        a2, created_a2 = Artist.objects.get_or_create(
            user=artist2_user,
            defaults=dict(
                stage_name="Meghana K",
                stage_name_kn="ಮೇಘನಾ ಕೆ",
                bio="Folk singer-songwriter exploring Kannada oral traditions through indie arrangements.",
                city=mys, is_active=True, is_featured=True,
                instagram="meghana.k.music", booking_email="meghana@naada.live",
                booking_fee_min=Decimal("3000"), booking_fee_max=Decimal("12000"),
            )
        )
        if created_a2:
            a2.genres.add(genre_objs["folk"], genre_objs["indie"])

        a3, created_a3 = Artist.objects.get_or_create(
            user=artist3_user,
            defaults=dict(
                stage_name="Krishna Rao Quartet",
                stage_name_kn="ಕೃಷ್ಣ ರಾವ್ ಕ್ವಾರ್ಟೆಟ್",
                bio="Jazz ensemble fusing Hindustani and contemporary jazz. Based in Bengaluru.",
                city=blr, is_active=True, is_featured=True,
                instagram="krishnaraomusic", booking_email="krishna@naada.live",
                booking_fee_min=Decimal("8000"), booking_fee_max=Decimal("30000"),
            )
        )
        if created_a3:
            a3.genres.add(genre_objs["jazz"], genre_objs["classical"])

        a4, created_a4 = Artist.objects.get_or_create(
            user=artist4_user,
            defaults=dict(
                stage_name="Divya Nair",
                stage_name_kn="ದಿವ್ಯಾ ನಾಯರ್",
                bio="Carnatic vocalist with a flair for Carnatic fusion. Performs regularly in Mysuru sabhas.",
                city=mys, is_active=True, is_featured=False,
                instagram="divyanairmusic", booking_email="divya@naada.live",
                booking_fee_min=Decimal("4000"), booking_fee_max=Decimal("15000"),
            )
        )
        if created_a4:
            a4.genres.add(genre_objs["carnatic-fusion"], genre_objs["classical"])

        self.stdout.write("Seeding events...")
        now = timezone.now()
        e1, _ = Event.objects.get_or_create(
            title="Tuesday Open Mic — Gokulam",
            defaults=dict(
                organizer=venue_owner, venue=v1,
                title_kn="ಮಂಗಳವಾರ ಓಪನ್ ಮಿಕ್ — ಗೋಕುಲಂ",
                description="Every Tuesday. 10 slots. Any genre. Sign up at the door.",
                event_type="open_mic", status=EventStatus.PUBLISHED,
                start_datetime=now + timedelta(days=2, hours=14),
                end_datetime=now + timedelta(days=2, hours=17),
                doors_open_at=now + timedelta(days=2, hours=13, minutes=30),
                is_free=True, max_capacity=80, is_featured=True,
                created_by=venue_owner, published_at=now,
                is_seeking_artists=True,
                performance_budget_min=Decimal("0"),
                performance_budget_max=Decimal("0"),
            )
        )
        if _:
            e1.genres.add(genre_objs["open-mic"])
            TicketTier.objects.get_or_create(
                event=e1, name="Free Entry",
                defaults=dict(name_kn="ಉಚಿತ ಪ್ರವೇಶ", price=Decimal("0"),
                              total_quantity=80, tier_type="general",
                              is_active=True, min_per_order=1, max_per_order=4)
            )

        e2, _ = Event.objects.get_or_create(
            title="Rahul & The Mysore Blues — Live",
            defaults=dict(
                organizer=venue_owner, venue=v1,
                title_kn="ರಾಹುಲ್ & ಮೈಸೂರ್ ಬ್ಲೂಸ್ — ಲೈವ್",
                description="Three-piece blues-rock from Mysuru. Expect Carnatic scales over Chicago grooves.",
                event_type="concert", status=EventStatus.PUBLISHED,
                start_datetime=now + timedelta(days=5, hours=15),
                end_datetime=now + timedelta(days=5, hours=18),
                doors_open_at=now + timedelta(days=5, hours=14, minutes=30),
                is_free=False, max_capacity=120, is_featured=True,
                created_by=venue_owner, published_at=now,
            )
        )
        if _:
            e2.genres.add(genre_objs["blues"], genre_objs["carnatic-fusion"])
            EventArtist.objects.get_or_create(event=e2, artist=a1, defaults={"is_headliner": True})
            TicketTier.objects.get_or_create(
                event=e2, name="General",
                defaults=dict(name_kn="ಸಾಮಾನ್ಯ", price=Decimal("249"),
                              total_quantity=100, tier_type="general", is_active=True,
                              min_per_order=1, max_per_order=6)
            )
            TicketTier.objects.get_or_create(
                event=e2, name="VIP Front Row",
                defaults=dict(name_kn="ವಿಐಪಿ", price=Decimal("499"),
                              total_quantity=20, tier_type="vip", is_active=True,
                              benefits=["Front row seat", "Artist meet & greet"],
                              min_per_order=1, max_per_order=2)
            )

        e3, _ = Event.objects.get_or_create(
            title="Jazz Nights — Rangashankara",
            defaults=dict(
                organizer=admin_user, venue=v2,
                title_kn="ಜಾಝ್ ನೈಟ್ಸ್ — ರಂಗಶಂಕರ",
                description="An evening of Hindustani-jazz fusion with the Krishna Rao Quartet.",
                event_type="concert", status=EventStatus.PUBLISHED,
                start_datetime=now + timedelta(days=8, hours=18),
                end_datetime=now + timedelta(days=8, hours=21),
                doors_open_at=now + timedelta(days=8, hours=17, minutes=30),
                is_free=False, max_capacity=300, is_featured=True,
                created_by=admin_user, published_at=now,
                is_seeking_artists=False,
            )
        )
        if _:
            e3.genres.add(genre_objs["jazz"])
            EventArtist.objects.get_or_create(event=e3, artist=a3, defaults={"is_headliner": True})
            TicketTier.objects.get_or_create(
                event=e3, name="General",
                defaults=dict(name_kn="ಸಾಮಾನ್ಯ", price=Decimal("350"),
                              total_quantity=250, tier_type="general", is_active=True,
                              min_per_order=1, max_per_order=8)
            )
            TicketTier.objects.get_or_create(
                event=e3, name="Table for Two",
                defaults=dict(name_kn="ಟೇಬಲ್ ಫಾರ್ ಟು", price=Decimal("799"),
                              total_quantity=30, tier_type="table", is_active=True,
                              min_per_order=1, max_per_order=4)
            )

        e4, _ = Event.objects.get_or_create(
            title="Carnatic Folk Evening — VV Mohalla",
            defaults=dict(
                organizer=venue_owner, venue=v3,
                title_kn="ಕರ್ನಾಟಕ ಜಾನಪದ ಸಂಜೆ — ವಿ.ವಿ. ಮೊಹಲ್ಲಾ",
                description="An intimate evening of Carnatic and folk music. Divya Nair and Meghana K perform together.",
                event_type="concert", status=EventStatus.PUBLISHED,
                start_datetime=now + timedelta(days=12, hours=17),
                end_datetime=now + timedelta(days=12, hours=20),
                doors_open_at=now + timedelta(days=12, hours=16, minutes=30),
                is_free=False, max_capacity=80, is_featured=False,
                created_by=venue_owner, published_at=now,
                is_seeking_artists=True,
                performance_budget_min=Decimal("4000"),
                performance_budget_max=Decimal("10000"),
            )
        )
        if _:
            e4.genres.add(genre_objs["carnatic-fusion"], genre_objs["folk"])
            EventArtist.objects.get_or_create(event=e4, artist=a4, defaults={"is_headliner": True})
            EventArtist.objects.get_or_create(event=e4, artist=a2, defaults={"is_headliner": False})
            TicketTier.objects.get_or_create(
                event=e4, name="General",
                defaults=dict(name_kn="ಸಾಮಾನ್ಯ", price=Decimal("199"),
                              total_quantity=60, tier_type="general", is_active=True,
                              min_per_order=1, max_per_order=4)
            )

        self.stdout.write("Seeding bookings / organizer / orders...")
        self._seed_bookings(venue_owner, artist_user, a1, e2, blr)

        self.stdout.write(self.style.SUCCESS(
            "\n✓ Seed complete!\n"
            "  Admin login:  admin@naada.live / naada@admin123\n"
            "  Venue owner:  venue@naada.live\n"
            "  Artist:       artist@naada.live\n"
            "  Fan:          fan@naada.live\n"
            "  API:          http://localhost:8000/api/v1/\n"
            "  Admin panel:  http://localhost:8000/admin/\n"
        ))

    def _seed_bookings(self, venue_owner, artist_user, artist, event, city):
        from apps.bookings.models import (
            Organizer, Membership, BookingConversation, BookingMessage,
            Offer, BookingOrder, Transfer, LedgerEntry,
        )
        from apps.bookings.serializers import compute_fees
        from django.utils import timezone
        from decimal import Decimal

        # Organizer for venue_owner
        org, _ = Organizer.objects.get_or_create(
            slug="gokulam-music-productions",
            defaults=dict(
                name="Gokulam Music Productions",
                name_kn="ಗೋಕುಲಂ ಮ್ಯೂಸಿಕ್ ಪ್ರೊಡಕ್ಷನ್ಸ್",
                organizer_type=Organizer.OrgType.VENUE,
                contact_email="hello@gokulammusichal.com",
                city=city,
                is_active=True,
                is_verified=True,
            )
        )
        Membership.objects.get_or_create(
            user=venue_owner, organizer=org,
            defaults={"role": Membership.Role.OWNER, "is_active": True}
        )

        # Booking conversation
        convo, _ = BookingConversation.objects.get_or_create(
            organizer=org, artist=artist, event=event,
            defaults={"initiated_by": venue_owner}
        )

        if _:
            BookingMessage.objects.create(
                conversation=convo, sender=venue_owner,
                content="Hi Rahul, we'd love to have you perform at Gokulam Music Hall for the upcoming concert. What's your availability?"
            )
            BookingMessage.objects.create(
                conversation=convo, sender=artist_user,
                content="Hey! That sounds great. I'm available and would love to do this show."
            )

        # Offer
        perf_date = (timezone.now() + __import__("datetime").timedelta(days=5)).date()
        offer, offer_created = Offer.objects.get_or_create(
            conversation=convo,
            proposed_by=venue_owner,
            defaults=dict(
                fee_amount=Decimal("15000"),
                performance_date=perf_date,
                performance_duration_minutes=90,
                set_count=1,
                notes="One set, 90 minutes. Sound check at 4 PM.",
                status=Offer.Status.ACCEPTED,
                expires_at=timezone.now() + __import__("datetime").timedelta(hours=48),
                responded_by=artist_user,
                responded_at=timezone.now(),
            )
        )

        # BookingOrder
        order, order_created = BookingOrder.objects.get_or_create(
            offer=offer,
            defaults=dict(
                organizer=org,
                artist=artist,
                event=event,
                gross_amount=Decimal("15000"),
                platform_fee=Decimal("1500"),
                tds_amount=Decimal("150"),
                artist_payout=Decimal("13350"),
                performance_date=perf_date,
                performance_duration_minutes=90,
                status=BookingOrder.Status.FUNDED,
                razorpay_order_id="order_DEV_seed001",
                razorpay_payment_id="pay_DEV_seed001",
                funded_at=timezone.now(),
            )
        )

        if order_created:
            # Transfer record
            Transfer.objects.create(
                booking_order=order,
                razorpay_transfer_id="transfer_DEV_seed001",
                razorpay_payment_id="pay_DEV_seed001",
                amount=Decimal("13350"),
                on_hold=True,
                recipient_account_id=artist_user.email,
            )

            # Ledger entries
            LedgerEntry.objects.bulk_create([
                LedgerEntry(
                    booking_order=order,
                    entry_type=LedgerEntry.EntryType.GROSS_CHARGE,
                    amount=Decimal("15000"),
                    description="Host payment",
                    reference_id="pay_DEV_seed001",
                ),
                LedgerEntry(
                    booking_order=order,
                    entry_type=LedgerEntry.EntryType.PLATFORM_FEE,
                    amount=Decimal("-1500"),
                    description="Platform commission (10%)",
                ),
                LedgerEntry(
                    booking_order=order,
                    entry_type=LedgerEntry.EntryType.TDS,
                    amount=Decimal("-150"),
                    description="TDS (194-O)",
                ),
                LedgerEntry(
                    booking_order=order,
                    entry_type=LedgerEntry.EntryType.ARTIST_PAYOUT,
                    amount=Decimal("-13350"),
                    description="Artist payout (held in escrow)",
                ),
            ])
        self.stdout.write(f"  Organizer: {org.name}, Order status: {order.status}")
