from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from django.conf import settings
import firebase_admin
from firebase_admin import auth, credentials

# Initialize Firebase Admin SDK (Mock for now if no creds)
try:
    if not firebase_admin._apps:
        # In production, use credentials.Certificate('path/to/serviceAccountKey.json')
        # For local dev without keys, we might need to mock this or use a placeholder
        cred = credentials.ApplicationDefault() 
        firebase_admin.initialize_app(cred)
except Exception as e:
    print(f"Firebase Init Warning: {e}")

class CustomAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data,
                                           context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        
        # 1. Generate standard Django Token (optional, if we want to keep using DRF token auth too)
        token, created = Token.objects.get_or_create(user=user)

        # 2. Generate Firebase Custom Token
        # Claims to embed
        additional_claims = {
            'role': user.role,
            'org_id': user.organization.id if user.organization else None,
            'is_staff': user.is_staff
        }

        try:
            # Note: This requires a Service Account with Token Creator permissions
            # For this MVP step, if we don't have creds, this might fail.
            # We will catch it and return a mock if needed for dev.
            firebase_token = auth.create_custom_token(str(user.id), additional_claims)
            firebase_token_str = firebase_token.decode('utf-8') if isinstance(firebase_token, bytes) else firebase_token
        except Exception as e:
            print(f"Error generating Firebase token: {e}")
            firebase_token_str = "MOCK_FIREBASE_TOKEN_FOR_DEV"

        return Response({
            'token': token.key,
            'firebase_token': firebase_token_str,
            'user_id': user.pk,
            'email': user.email,
            'role': user.role
        })

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'id': request.user.id,
            'email': request.user.email,
            'role': request.user.role,
            'organization': request.user.organization.name if request.user.organization else None
        })
