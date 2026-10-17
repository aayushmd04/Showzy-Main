"""Add a fuller set of DEMO content for local development.

Everything here is invented: the venues, artists, events and their prices do not
exist. It is meant to make the local site look lived-in across both cities and all
five art forms; never run it against a real database. Safe to run twice: rows are
looked up by slug / email / title first. Event dates are relative to today, so a
re-run after a few days adds nothing but the gaps (past events are left alone).
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Add demo venues, artists and events (local development only)"

    def handle(self, *args, **options):
        from apps.core.models import Area, City, Genre
        from apps.core.management import seed_images
        from apps.venues.models import Venue, VenuePhoto
        from apps.artists.models import Artist, ArtistPhoto
        from apps.events.models import Event, EventArtist, EventPhoto, EventStatus
        from apps.tickets.models import TicketTier

        User = get_user_model()
        blr = City.objects.get(slug="bengaluru")
        mys = City.objects.get(slug="mysuru")
        owner = User.objects.filter(email="venue@naada.live").first() or User.objects.filter(is_staff=True).first()

        # ── genres ────────────────────────────────────────────────────────────
        genre_rows = [
            ("Theatre", "ರಂಗಭೂಮಿ", "theatre", "🎭", "#9B1C2C"),
            ("Street Play", "ಬೀದಿ ನಾಟಕ", "street-play", "📣", "#B45309"),
            ("Bharatanatyam", "ಭರತನಾಟ್ಯ", "bharatanatyam", "💃", "#2563EB"),
            ("Kathak", "ಕಥಕ್", "kathak", "🩰", "#7C3AED"),
            ("Contemporary Dance", "ಸಮಕಾಲೀನ ನೃತ್ಯ", "contemporary-dance", "🕺", "#0891B2"),
            ("Stand-up Comedy", "ಸ್ಟ್ಯಾಂಡ್-ಅಪ್", "stand-up-comedy", "🎙️", "#D97706"),
            ("Improv", "ಇಂಪ್ರೊವ್", "improv", "🎲", "#16A34A"),
            ("Poetry", "ಕವಿತೆ", "poetry", "✒️", "#BE185D"),
            ("Painting Workshop", "ಚಿತ್ರಕಲಾ ಕಾರ್ಯಾಗಾರ", "painting-workshop", "🎨", "#7C3AED"),
            ("Storytelling", "ಕಥೆ ಹೇಳುವುದು", "storytelling", "📖", "#0F766E"),
            ("Hindustani", "ಹಿಂದೂಸ್ತಾನಿ", "hindustani", "🪘", "#9D174D"),
        ]
        g = {}
        for order, (name, kn, slug, icon, colour) in enumerate(genre_rows, start=20):
            g[slug], _ = Genre.objects.get_or_create(
                slug=slug, defaults=dict(name=name, name_kn=kn, icon=icon, color=colour, sort_order=order))
        for slug in ["open-mic", "blues", "jazz", "folk", "carnatic-fusion", "rock", "indie", "classical"]:
            g[slug] = Genre.objects.get(slug=slug)

        # ── venues (all invented) ─────────────────────────────────────────────
        def area(city, name, slug):
            a, _ = Area.objects.get_or_create(city=city, slug=slug, defaults={"name": name, "name_kn": name})
            return a

        venue_rows = [
            ("lantern-yard-cafe", "Lantern Yard Café", mys, "gokulam", "Gokulam", 60, "A courtyard café with a small corner stage.", "570002"),
            ("palm-street-studio", "Palm Street Studio", mys, "jayalakshmipuram", "Jayalakshmipuram", 45, "A rehearsal studio that opens its doors on weekends.", "570012"),
            ("old-cinema-hall", "The Old Cinema Hall", mys, "vv-mohalla", "VV Mohalla", 180, "A restored single-screen hall used for theatre and dance.", "570002"),
            ("tin-roof-bar", "Tin Roof Bar", blr, "indiranagar", "Indiranagar", 90, "A neighbourhood bar with live sets most weekends.", "560038"),
            ("blue-door-gallery", "Blue Door Gallery", blr, "jayanagar", "Jayanagar", 50, "A gallery and workshop room.", "560011"),
            ("basavanagudi-sabha", "Basavanagudi Sabha", blr, "basavanagudi", "Basavanagudi", 150, "A community hall for classical music and dance.", "560004"),
            ("koramangala-loft", "Koramangala Loft", blr, "koramangala", "Koramangala", 110, "A first-floor room for comedy and spoken word.", "560034"),
        ]
        venues = {}
        for i, (slug, name, city, area_slug, area_name, cap, blurb, pin) in enumerate(venue_rows):
            v, made = Venue.objects.get_or_create(slug=slug, defaults=dict(
                owner=owner, name=name, tagline=blurb, description=blurb,
                address_line1=f"{10 + i} Demo Street, {area_name}", area=area(city, area_name, area_slug),
                city=city, pincode=pin, capacity=cap, stage_type="indoor",
                has_sound_system=True, is_active=True, is_verified=True))
            venues[slug] = v
            if made:
                path, alt = seed_images.pick("venues", i + 3)
                if path:
                    VenuePhoto.objects.get_or_create(venue=v, image=path, defaults=dict(
                        caption=alt, is_primary=True, sort_order=0, uploaded_by=owner))

        # ── artists (all invented) ────────────────────────────────────────────
        artist_rows = [
            ("anaya.rao", "Anaya Rao", mys, ["bharatanatyam"], "Bharatanatyam dancer and teacher.", 6000, 18000),
            ("ishaan.m", "Ishaan M", blr, ["stand-up-comedy"], "Observational stand-up about city life.", 5000, 20000),
            ("the.paper.boats", "The Paper Boats", blr, ["indie", "folk"], "Four-piece indie-folk band.", 8000, 30000),
            ("sahana.kulkarni", "Sahana Kulkarni", blr, ["kathak"], "Kathak performer and choreographer.", 7000, 22000),
            ("rangamanch.mysuru", "Rangamanch Mysuru", mys, ["theatre", "street-play"], "A theatre collective staging new Kannada plays.", 10000, 35000),
            ("tara.d", "Tara D", blr, ["poetry", "storytelling"], "Spoken-word poet and storyteller.", 3000, 10000),
            ("vikram.hegde", "Vikram Hegde", mys, ["hindustani", "classical"], "Hindustani vocalist.", 6000, 20000),
            ("late.bloom.improv", "Late Bloom Improv", blr, ["improv"], "An improv troupe with weekly shows.", 6000, 18000),
            ("noor.and.the.strings", "Noor & The Strings", mys, ["jazz", "blues"], "A jazz-blues trio.", 7000, 24000),
            ("kiran.painter", "Kiran Shetty", mys, ["painting-workshop"], "Painter who runs hands-on workshops.", 2500, 8000),
        ]
        artists = {}
        for i, (handle, name, city, gslugs, bio, lo, hi) in enumerate(artist_rows):
            u, _ = User.objects.get_or_create(email=f"{handle}@naada.live", defaults=dict(
                full_name=name, role="artist", is_verified=True, city=city))
            a, made = Artist.objects.get_or_create(user=u, defaults=dict(
                stage_name=name, bio=bio, city=city, is_active=True, is_featured=i < 4,
                booking_fee_min=Decimal(lo), booking_fee_max=Decimal(hi)))
            if made:
                a.genres.add(*[g[s] for s in gslugs])
                path, alt = seed_images.pick("artists", i + 4)
                if path:
                    ArtistPhoto.objects.get_or_create(artist=a, image=path, defaults=dict(
                        caption=alt, is_primary=True, sort_order=0))
            artists[handle] = a

        # ── events (dates relative to now) ────────────────────────────────────
        # Hours below are local (India) time, so build them from local midnight.
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        local_today = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)

        def at(days, hour):
            base = (local_today + timedelta(days=days)).replace(hour=hour)
            return base if base > now else now + timedelta(hours=2)

        # (title, venue, who, genres, type, days, hour, hours, description, [(tier, price, qty, sold)], free)
        ev = [
            ("Late Bloom Improv: Tonight's Show", "koramangala-loft", ["late.bloom.improv"], ["improv", "stand-up-comedy"], "comedy", 0, 20, 2,
             "Made-up scenes from audience suggestions.", [("General", 250, 70, 52)], False),
            ("Poetry Open Circle", "lantern-yard-cafe", ["tara.d"], ["poetry"], "other", 0, 19, 2,
             "Bring a poem or just listen. Open sign-up at the door.", [("Free Entry", 0, 40, 0)], True),
            ("Stand-up Night with Ishaan M", "tin-roof-bar", ["ishaan.m"], ["stand-up-comedy"], "comedy", 1, 20, 2,
             "An hour of new material, then open questions.", [("General", 299, 80, 30)], False),
            ("Bharatanatyam Evening: Anaya Rao", "old-cinema-hall", ["anaya.rao"], ["bharatanatyam"], "classical", 2, 18, 2,
             "A solo recital in the old hall.", [("General", 249, 150, 40), ("Front Rows", 449, 30, 12)], False),
            ("The Paper Boats: Acoustic Night", "tin-roof-bar", ["the.paper.boats"], ["indie", "folk"], "concert", 3, 20, 3,
             "Unplugged versions of the new songs.", [("General", 199, 90, 20)], False),
            ("Rangamanch Presents: A New Play", "old-cinema-hall", ["rangamanch.mysuru"], ["theatre"], "theatre", 4, 19, 2,
             "A new Kannada play. Surtitles in English.", [("General", 199, 160, 35)], False),
            ("Kathak Morning with Sahana Kulkarni", "basavanagudi-sabha", ["sahana.kulkarni"], ["kathak"], "classical", 5, 11, 2,
             "A morning recital followed by a short talk.", [("General", 149, 120, 18)], False),
            ("Weekend Painting Workshop", "blue-door-gallery", ["kiran.painter"], ["painting-workshop"], "workshop", 5, 15, 3,
             "Materials provided. No experience needed.", [("Workshop Seat", 299, 20, 8)], False),
            ("Noor & The Strings: Jazz Evening", "lantern-yard-cafe", ["noor.and.the.strings"], ["jazz", "blues"], "jazz", 6, 19, 3,
             "Standards and originals in a courtyard.", [("General", 249, 55, 49)], False),
            ("Open Mic: All Art Forms", "palm-street-studio", [], ["open-mic", "poetry"], "open_mic", 8, 17, 3,
             "Music, poetry, anything under ten minutes.", [("Free Entry", 0, 45, 0)], True),
            ("Hindustani Evening: Vikram Hegde", "old-cinema-hall", ["vikram.hegde"], ["hindustani", "classical"], "classical", 10, 18, 2,
             "Raga-based vocal recital.", [("General", 199, 150, 25)], False),
            ("Storytelling Night: Tara D", "koramangala-loft", ["tara.d"], ["storytelling", "poetry"], "other", 13, 19, 2,
             "True stories told out loud.", [("General", 150, 60, 10)], False),
            ("Contemporary Dance Showcase", "basavanagudi-sabha", ["sahana.kulkarni"], ["contemporary-dance", "kathak"], "classical", 16, 18, 2,
             "Short new works by local choreographers.", [("General", 249, 130, 22)], False),
            ("Street Play Festival: Day 1", "palm-street-studio", ["rangamanch.mysuru"], ["street-play", "theatre"], "theatre", 21, 16, 4,
             "Open-air street plays, free to watch.", [("Free Entry", 0, 200, 0)], True),
            ("Comedy Double Bill", "koramangala-loft", ["ishaan.m", "late.bloom.improv"], ["stand-up-comedy", "improv"], "comedy", 26, 20, 3,
             "A stand-up set, then an improv show.", [("General", 299, 100, 15)], False),
            ("Folk & Indie Sessions", "lantern-yard-cafe", ["the.paper.boats", "noor.and.the.strings"], ["folk", "indie", "jazz"], "concert", 33, 19, 3,
             "Two bands, one courtyard.", [("General", 249, 60, 5)], False),
        ]
        created = 0
        for i, (title, vslug, who, gslugs, etype, days, hour, hours, desc, tiers, free) in enumerate(ev):
            start = at(days, hour)
            e, made = Event.objects.get_or_create(title=title, defaults=dict(
                organizer=owner, venue=venues[vslug], description=desc, event_type=etype,
                status=EventStatus.PUBLISHED, start_datetime=start,
                end_datetime=start + timedelta(hours=hours),
                doors_open_at=start - timedelta(minutes=30), is_free=free,
                max_capacity=sum(t[2] for t in tiers), is_featured=i < 5,
                created_by=owner, published_at=now))
            if not made:
                # Keep the demo dates current: move a still-future demo event to today's calendar.
                if e.start_datetime != start:
                    e.start_datetime = start
                    e.end_datetime = start + timedelta(hours=hours)
                    e.doors_open_at = start - timedelta(minutes=30)
                    e.save(update_fields=["start_datetime", "end_datetime", "doors_open_at"])
                continue
            created += 1
            e.genres.add(*[g[s] for s in gslugs])
            for j, h in enumerate(who):
                EventArtist.objects.get_or_create(event=e, artist=artists[h], defaults={"is_headliner": j == 0})
            for k, (tname, price, qty, sold) in enumerate(tiers):
                TicketTier.objects.get_or_create(event=e, name=tname, defaults=dict(
                    price=Decimal(price), total_quantity=qty, sold_quantity=sold,
                    tier_type="general" if k == 0 else "vip", is_active=True, sort_order=k,
                    min_per_order=1, max_per_order=6))
            poster, alt = seed_images.pick("events", i)
            if poster:
                e.poster_image = poster
                banner, _ = seed_images.pick("events", i + 7)
                if banner:
                    e.banner_image = banner
                e.save(update_fields=["poster_image", "banner_image"])
                EventPhoto.objects.get_or_create(event=e, image=poster, defaults=dict(
                    caption=alt, is_primary=True, sort_order=0, uploaded_by=owner))

        self.stdout.write(self.style.SUCCESS(
            f"Demo content: {len(venues)} venues, {len(artists)} artists, {created} new events "
            "(all invented, for local development only)."))
