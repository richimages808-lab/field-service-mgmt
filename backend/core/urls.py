from django.urls import path
from .views import CustomAuthToken, MeView

urlpatterns = [
    path('login/', CustomAuthToken.as_view(), name='api_login'),
    path('me/', MeView.as_view(), name='api_me'),
]
