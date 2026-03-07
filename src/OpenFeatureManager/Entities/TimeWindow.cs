using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("time_windows")]
public class TimeWindow
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("file_id")]
    public long FileId { get; set; }

    /// <summary>Human-readable name, e.g. "Christmas Time", "Black Friday"</summary>
    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("start_time")]
    public DateTime? StartTime { get; set; }

    [Column("end_time")]
    public DateTime? EndTime { get; set; }
}
