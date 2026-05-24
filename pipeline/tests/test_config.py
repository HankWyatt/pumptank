from pumptank_pipeline import config


def test_selection_config_present_and_valid():
    assert config.SELECT_TOP_N == 100
    assert config.MAX_SEASON == 16
    assert set(config.SELECTION_WEIGHTS) == {"reach", "ambition", "findability"}
    assert abs(sum(config.SELECTION_WEIGHTS.values()) - 1.0) < 1e-9


def test_token_metadata_config():
    assert config.MAX_TICKER_LEN == 10
    assert config.MAX_DESCRIPTION_LEN > 0
    assert isinstance(config.NAME_OVERRIDES, dict)
    d = config.TOKEN_DISCLAIMER.lower()
    assert "not affiliated" in d and "not financial advice" in d
