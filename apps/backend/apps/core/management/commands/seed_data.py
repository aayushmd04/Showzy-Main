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
        areas_blr = [("Koramangala", "ಕೋರಮಂಗಲ", "koramangala"), ("Indiranagar", "ಇಂದಿರಾ ನಗರ", "indiranagar"),
                     ("Jayanagar", "ಜಯನಗರ", "jayanagar"), ("Basavanagudi", "ಬಸವನಗುಡಿ", "basavanagudi")]
        areas_mys = [("VV Mohalla", "ವಿ.ವಿ. ಮೊಹಲ್ಲಾ", "vv-mohalla"), ("Gokulam", "ಗೋಕುಲಂ", "gokulam"),
                     ("Jayalakshmipuram", "ಜಯಲಕ್ಷ್ಮೀಪುರಂ", "jayalakshmipuram")]
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
            defaults={"full_name": "Priya Sharma", "role": "venue_owner", "is_verified": True,
                      "city": mys}
        )
        artist_user, _ = User.objects.get_or_create(
            email="artist@naada.live",
            defaults={"full_name": "Rahul Venkat", "role": "artist", "is_verified": True,
                      "city": blr}
        )
        attendee, _ = User.objects.get_or_create(
            email="fan@naada.live",
            defaults={"full_name": "Meera Krishnan", "role": "attendee", "is_verified": True,
                      "city": mys}
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
                is_active=True, contact_email="hello@gokulammusichal.com",
                instagram="gokulammusichal",
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

        self.stdout.write("Seeding artists...")
        a1, _ = Artist.objects.get_or_create(
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
        if _:
            a1.genres.add(genre_objs["blues"], genre_objs["carnatic-fusion"])

        a2, _ = Artist.objects.get_or_create(
            stage_name="Meghana K",
            defaults=dict(
                stage_name_kn="ಮೇಘನಾ ಕೆ",
                bio="Folk singer-songwriter exploring Kannada oral traditions through indie arrangements.",
                city=mys, is_active=True, is_featured=True,
                instagram="meghana.k.music",
                booking_email="meghana@naada.live",
            )
        )
        if _:
            a2.genres.add(genre_objs["folk"], genre_objs["indie"])

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

        self.stdout.write(self.style.SUCCESS(
            "\n✓ Seed complete!\n"
            "  Admin login:  admin@naada.live / naada@admin123\n"
            "  Venue owner:  venue@naada.live\n"
            "  Artist:       artist@naada.live\n"
            "  Fan:          fan@naada.live\n"
            "  API:          http://localhost:8000/api/v1/\n"
            "  Admin panel:  http://localhost:8000/admin/\n"
        ))
