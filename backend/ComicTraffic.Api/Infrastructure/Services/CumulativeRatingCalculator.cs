using ComicTraffic.Api.Domain.Entities;

namespace ComicTraffic.Api.Infrastructure.Services;

public interface ICumulativeRatingCalculator
{
    CumulativeRatingSummary CalculateCumulativeRating(
        IEnumerable<ExternalRatingSource> sources,
        IDictionary<string, double>? customWeights = null);
}

public class CumulativeRatingCalculator : ICumulativeRatingCalculator
{
    private const double GlobalBayesianPrior = 74.0;
    private const double BayesianMinimumVoteThreshold = 2500.0;

    public CumulativeRatingSummary CalculateCumulativeRating(
        IEnumerable<ExternalRatingSource> sources,
        IDictionary<string, double>? customWeights = null)
    {
        var activeSources = (sources ?? Enumerable.Empty<ExternalRatingSource>())
            .Where(s => s.NormalizedScore >= 0 && s.NormalizedScore <= 100)
            .ToList();

        if (activeSources.Count == 0)
        {
            return new CumulativeRatingSummary
            {
                FinalCumulativeAverage = 0,
                FinalStarScoreOutOfTen = 0,
                SimpleArithmeticAverage = 0,
                BayesianWeightedScore = 0,
                CriticConsensusScore = 0,
                AudienceConsensusScore = 0,
                ComicCommunityScore = 0,
                PolarizationIndex = 0,
                ConsensusTier = "Unrated",
                TotalAggregatedVotes = 0,
                ActiveSourceCount = 0,
                Sources = new List<ExternalRatingSource>()
            };
        }

        double simpleAverage = activeSources.Average(s => s.NormalizedScore);
        int totalVotes = activeSources.Sum(s => Math.Max(0, s.VoteCount));

        double weightedNumerator = 0;
        double weightDenominator = 0;

        foreach (var src in activeSources)
        {
            double weight = src.DefaultWeight > 0 ? src.DefaultWeight : 1.0;
            if (customWeights != null &&
                (customWeights.TryGetValue(src.SourceId, out double customW) ||
                 customWeights.TryGetValue(src.SourceName, out customW)))
            {
                weight = Math.Max(0, customW);
            }

            // Incorporate mild logarithmic vote-confidence boost unless custom weights are explicitly overriding
            double confidenceFactor = customWeights != null
                ? 1.0
                : 1.0 + Math.Min(0.35, Math.Log10(Math.Max(10, src.VoteCount)) / 18.0);

            double effectiveWeight = weight * confidenceFactor;
            weightedNumerator += src.NormalizedScore * effectiveWeight;
            weightDenominator += effectiveWeight;
        }

        double weightedAverage = weightDenominator > 0
            ? weightedNumerator / weightDenominator
            : simpleAverage;

        // Bayesian shrinkage formula: (v / (v + m)) * R + (m / (v + m)) * C
        double v = Math.Max(100.0, totalVotes);
        double m = BayesianMinimumVoteThreshold;
        double bayesianScore = ((v / (v + m)) * weightedAverage) + ((m / (v + m)) * GlobalBayesianPrior);

        // If custom weights were explicitly passed, prioritize the weighted average directly
        double finalCumulative = customWeights != null && customWeights.Count > 0
            ? weightedAverage
            : (weightedAverage * 0.65) + (bayesianScore * 0.35);

        finalCumulative = Math.Round(Math.Clamp(finalCumulative, 0, 100), 1);

        var criticSources = activeSources.Where(s => s.Category.Equals("Critic", StringComparison.OrdinalIgnoreCase)).ToList();
        var audienceSources = activeSources.Where(s => s.Category.Equals("Audience", StringComparison.OrdinalIgnoreCase)).ToList();
        var comicSources = activeSources.Where(s => s.Category.Equals("ComicCommunity", StringComparison.OrdinalIgnoreCase)).ToList();

        double criticScore = criticSources.Count > 0 ? Math.Round(criticSources.Average(s => s.NormalizedScore), 1) : finalCumulative;
        double audienceScore = audienceSources.Count > 0 ? Math.Round(audienceSources.Average(s => s.NormalizedScore), 1) : finalCumulative;
        double comicScore = comicSources.Count > 0 ? Math.Round(comicSources.Average(s => s.NormalizedScore), 1) : finalCumulative;

        double variance = activeSources.Average(s => Math.Pow(s.NormalizedScore - simpleAverage, 2));
        double stdDev = Math.Round(Math.Sqrt(variance), 2);

        string consensusTier = DetermineConsensusTier(finalCumulative, stdDev);

        return new CumulativeRatingSummary
        {
            FinalCumulativeAverage = finalCumulative,
            FinalStarScoreOutOfTen = Math.Round(finalCumulative / 10.0, 2),
            SimpleArithmeticAverage = Math.Round(simpleAverage, 1),
            BayesianWeightedScore = Math.Round(bayesianScore, 1),
            CriticConsensusScore = criticScore,
            AudienceConsensusScore = audienceScore,
            ComicCommunityScore = comicScore,
            PolarizationIndex = stdDev,
            ConsensusTier = consensusTier,
            TotalAggregatedVotes = totalVotes,
            ActiveSourceCount = activeSources.Count,
            Sources = activeSources
        };
    }

    private static string DetermineConsensusTier(double finalScore, double stdDev)
    {
        if (stdDev >= 12.5 && finalScore >= 60)
            return "Highly Polarizing / Cult Classic";
        if (finalScore >= 90)
            return "Universal Acclaim";
        if (finalScore >= 82)
            return "Certified Must-Experience";
        if (finalScore >= 72)
            return "Generally Favorable";
        if (finalScore >= 58)
            return "Mixed / Average Consensus";
        return "Generally Unfavorable";
    }
}
