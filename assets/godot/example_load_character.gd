# Godot 4 — load character spritesheet + JSON metadata (see assets/sprites/characters/<class>/)
# Attach to a node with AnimatedSprite2D; assign character_class export in the inspector.
extends Node2D

@export var character_class: String = "warrior"

func _ready() -> void:
	var base := "res://assets/sprites/characters/%s" % character_class
	var tex: Texture2D = load("%s/%s_spritesheet.png" % [base, character_class])
	var meta: Dictionary = _load_json("%s/%s_spritesheet.json" % [base, character_class])
	if tex == null or meta.is_empty():
		push_warning("Missing spritesheet or JSON for class: %s" % character_class)
		return
	# Build SpriteFrames from meta.animations rows — integrate with your sheet layout.
	# See warrior_spritesheet.json for row/frame counts and fps per animation.

func _load_json(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var txt := f.get_as_text()
	var data = JSON.parse_string(txt)
	return data if data is Dictionary else {}
