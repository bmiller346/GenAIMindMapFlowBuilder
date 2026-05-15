import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph.domain_profiles import (
    DOMAIN_PROFILE_IDS,
    DOMAIN_PROFILE_REGISTRY_VERSION,
    build_domain_profile_prompt_context,
    domain_profile_registry,
    get_domain_profile,
    is_domain_profile,
    list_domain_profiles,
    normalize_domain_profile_id,
)


def test_domain_profile_registry_contains_supported_profiles():
    expected_profiles = {
        "generic",
        "revit_standards",
        "software_inventory",
        "project_delivery",
        "sop_process",
        "meeting_notes",
        "research_review",
        "custom",
    }

    registry = domain_profile_registry()

    assert registry["version"] == DOMAIN_PROFILE_REGISTRY_VERSION
    assert DOMAIN_PROFILE_IDS == expected_profiles
    assert set(registry["profiles"]) == expected_profiles
    assert {profile["id"] for profile in list_domain_profiles()} == expected_profiles


def test_each_domain_profile_exposes_structured_source_intelligence_contract():
    for profile in list_domain_profiles():
        assert profile["id"]
        assert profile["label"]
        assert profile["description"]
        assert profile["expected_artifact_types"]
        assert profile["common_relationship_types"]
        assert profile["default_prompts"]
        assert profile["review_checklist"]
        assert profile["output_templates"]

        for artifact in profile["expected_artifact_types"]:
            assert set(artifact) == {"id", "label", "description"}
            assert artifact["id"]
            assert artifact["label"]
            assert artifact["description"]

        for relationship in profile["common_relationship_types"]:
            assert set(relationship) == {"id", "label", "description", "directed"}
            assert relationship["id"]
            assert relationship["label"]
            assert relationship["description"]
            assert isinstance(relationship["directed"], bool)

        for prompt in profile["default_prompts"]:
            assert set(prompt) == {"id", "label", "prompt"}
            assert prompt["id"]
            assert prompt["label"]
            assert prompt["prompt"]

        for template in profile["output_templates"]:
            assert set(template) == {
                "id",
                "label",
                "description",
                "required_sections",
                "node_types",
                "relationship_types",
                "metadata",
            }
            assert template["required_sections"]
            assert template["node_types"]
            assert template["relationship_types"]
            assert isinstance(template["metadata"], dict)


def test_get_domain_profile_supports_labels_aliases_and_custom_fallback():
    assert normalize_domain_profile_id("SOP / Process") == "sop_process"
    assert get_domain_profile("SOP / Process")["id"] == "sop_process"
    assert get_domain_profile("Revit")["id"] == "revit_standards"
    assert get_domain_profile("meeting")["id"] == "meeting_notes"
    assert get_domain_profile("unknown-domain")["id"] == "custom"

    assert is_domain_profile("software inventory")
    assert not is_domain_profile("unknown-domain")


def test_domain_profile_results_are_copy_safe():
    profile = get_domain_profile("software_inventory")
    profile["expected_artifact_types"].append(
        {"id": "mutated", "label": "Mutated", "description": "Should not persist"}
    )
    profile["output_templates"][0]["metadata"]["mutated"] = True

    fresh_profile = get_domain_profile("software_inventory")

    assert all(
        artifact["id"] != "mutated"
        for artifact in fresh_profile["expected_artifact_types"]
    )
    assert "mutated" not in fresh_profile["output_templates"][0]["metadata"]


def test_domain_profile_prompt_context_summarizes_selected_profile():
    prompt_context = build_domain_profile_prompt_context("research_review")

    assert "Domain profile: Research Review (research_review)." in prompt_context
    assert "Expected artifact types: research_claim" in prompt_context
    assert "Common relationship types: supports" in prompt_context
    assert "Claims are directly tied to evidence and source references." in prompt_context
