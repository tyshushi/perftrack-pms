"""Stub routers — expand each into full CRUD as needed."""
from fastapi import APIRouter

users         = type("M", (), {"router": APIRouter()})()
departments   = type("M", (), {"router": APIRouter()})()
cycles        = type("M", (), {"router": APIRouter()})()
weight_rules  = type("M", (), {"router": APIRouter()})()
kpi_templates = type("M", (), {"router": APIRouter()})()
evaluations   = type("M", (), {"router": APIRouter()})()
scorecards    = type("M", (), {"router": APIRouter()})()
increments    = type("M", (), {"router": APIRouter()})()
notifications = type("M", (), {"router": APIRouter()})()
admin         = type("M", (), {"router": APIRouter()})()
