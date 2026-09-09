from django.urls import path
from . import views

urlpatterns = [
    path("cities/", views.CityListView.as_view(), name="cities-list"),
    path("areas/", views.AreaListView.as_view(), name="areas-list"),
    path("genres/", views.GenreListView.as_view(), name="genres-list"),
]
