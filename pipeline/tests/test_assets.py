from pumptank_pipeline.assets import _clean_name, _derive_symbol


def test_clean_name_camelcase():
    assert _clean_name("SmartTireCompany", {}, "id1") == "Smart Tire Company"
    assert _clean_name("BelloVerde", {}, "id2") == "Bello Verde"
    assert _clean_name("TheHappyBirdwatcher", {}, "id3") == "The Happy Birdwatcher"


def test_clean_name_allcaps_and_spaced_passthrough():
    assert _clean_name("ALL33", {}, "id4") == "ALL33"
    assert _clean_name("Already Spaced", {}, "id5") == "Already Spaced"


def test_clean_name_override_wins():
    assert _clean_name("Buzzy4Shots", {"id6": "Buzzy 4 Shots"}, "id6") == "Buzzy 4 Shots"


def test_derive_symbol_basic_and_suffix_strip():
    assert _derive_symbol("Smart Tire Company", 10) == "SMARTTIRE"
    assert _derive_symbol("Bello Verde", 10) == "BELLOVERDE"
    assert _derive_symbol("ALL33", 10) == "ALL33"


def test_derive_symbol_strips_leading_the_and_truncates():
    assert _derive_symbol("The Happy Birdwatcher", 10) == "HAPPYBIRDW"


def test_derive_symbol_strips_nonalnum_and_uppercases():
    assert _derive_symbol("Joye-bells!", 10) == "JOYEBELLS"
