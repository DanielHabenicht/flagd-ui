using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("time_windows")]
public class TimeWindow
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("collection_id")]
    public Guid CollectionId { get; set; }

    /// <summary>Human-readable name, e.g. "Christmas Time", "Black Friday"</summary>
    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("start_time")]
    public DateTime? StartTime { get; set; }

    [Column("end_time")]
    public DateTime? EndTime { get; set; }
}
