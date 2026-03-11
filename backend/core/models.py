from django.db import models
from django.contrib.auth.models import AbstractUser

class Organization(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    address = models.TextField(blank=True)
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class User(AbstractUser):
    ROLE_CHOICES = (
        ('owner', 'Owner'),
        ('dispatcher', 'Dispatcher'),
        ('technician', 'Technician'),
    )
    
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='users', null=True, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='owner')

    def __str__(self):
        return self.email
