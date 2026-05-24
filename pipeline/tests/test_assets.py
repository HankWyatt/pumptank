from pumptank_pipeline.assets import _clean_name


def test_clean_name_camelcase():
    assert _clean_name("SmartTireCompany", {}, "id1") == "Smart Tire Company"
    assert _clean_name("BelloVerde", {}, "id2") == "Bello Verde"
    assert _clean_name("TheHappyBirdwatcher", {}, "id3") == "The Happy Birdwatcher"


def test_clean_name_allcaps_and_spaced_passthrough():
    assert _clean_name("ALL33", {}, "id4") == "ALL33"
    assert _clean_name("Already Spaced", {}, "id5") == "Already Spaced"


def test_clean_name_override_wins():
    assert _clean_name("Buzzy4Shots", {"id6": "Buzzy 4 Shots"}, "id6") == "Buzzy 4 Shots"
